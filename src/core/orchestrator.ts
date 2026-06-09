import { TaskQueue } from "./task-queue.js";
import { AgentRegistry } from "./registry.js";
import { SharedContext } from "./context.js";
import type { PlannedTask } from "../agents/cmo-agent.js";
import type { MemoryStore } from "../memory/store.js";
import type { AgentName, AgentResult, NewTask, Task } from "./types.js";
import { log } from "../utils/logger.js";

/** Thrown to abort a run when its foundation (brand intelligence) fails. */
export class RunAbortedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "RunAbortedError";
  }
}

/**
 * The orchestrator runs the department. It:
 *   - enqueues the CMO's plan (translating @ref deps to real task ids),
 *   - drains the queue respecting priority + dependencies,
 *   - dispatches each task to its agent via the registry,
 *   - accepts follow-up tasks from agents (delegation),
 *   - then runs the CMO synthesis step.
 */
export class Orchestrator {
  private readonly queue = new TaskQueue();
  private readonly registry = new AgentRegistry();
  private readonly ctx: SharedContext;

  constructor(memory: MemoryStore, goal: string) {
    this.ctx = new SharedContext(memory, goal);
  }

  /** Enqueue a CMO plan, resolving by-name (@ref) dependencies into task ids. */
  enqueuePlan(plan: PlannedTask[]): void {
    const refToId = new Map<string, string>();
    const created: Array<{ task: Task; rawDeps: string[] }> = [];

    // Pass 1: add tasks without deps, capturing each ref -> id.
    for (const p of plan) {
      const { _ref, dependsOn, ...rest } = p;
      const task = this.queue.add({ ...rest, dependsOn: [], createdBy: "cmo" });
      refToId.set(_ref, task.id);
      created.push({ task, rawDeps: dependsOn ?? [] });
    }
    // Pass 2: resolve "@ref" deps into real ids.
    for (const { task, rawDeps } of created) {
      task.dependsOn = rawDeps
        .map((d) => (d.startsWith("@") ? refToId.get(d.slice(1)) : d))
        .filter((id): id is string => Boolean(id));
    }
  }

  /** Add a single ad-hoc task (used by single-engine CLI commands). */
  addTask(spec: NewTask): Task {
    return this.queue.add(spec);
  }

  /**
   * Drain the queue with a bounded concurrency pool, then synthesize. Independent
   * tasks (deps satisfied) run in parallel up to MOS_CONCURRENCY; dependent tasks
   * still wait for their predecessors, so outputs are identical to serial — only
   * the wall-clock overlaps.
   */
  async run(opts: { synthesize?: boolean } = {}): Promise<SharedContext> {
    const concurrency = Math.max(1, Number(process.env.MOS_CONCURRENCY || 3));
    const inFlight = new Map<string, Promise<void>>();
    let aborted: Error | null = null;

    while (true) {
      // Fill open slots with currently-runnable tasks.
      while (!aborted && inFlight.size < concurrency) {
        const task = this.queue.next();
        if (!task) break;
        // Claim synchronously so the next next() won't re-pick this task.
        task.status = "running";
        const p = this.dispatch(task)
          .catch((err) => {
            aborted = aborted ?? (err instanceof Error ? err : new Error(String(err)));
          })
          .finally(() => {
            inFlight.delete(task.id);
          });
        inFlight.set(task.id, p);
      }

      if (inFlight.size > 0) {
        // Wait for at least one task to finish, then try to schedule more.
        await Promise.race(inFlight.values());
        continue;
      }

      // Nothing in flight. Either we're aborting, done, or blocked.
      if (aborted) break;
      const blocked = this.queue.blockedTasks();
      if (blocked.length === 0) break; // all done
      for (const b of blocked) {
        b.status = "skipped";
        log.warn("orchestrator", `skipped ${b.type} (blocked dependencies)`);
        await this.ctx.memory.log({
          level: "warn",
          scope: "orchestrator",
          message: `Skipped ${b.type} — dependencies could not be satisfied`,
        });
      }
    }

    if (aborted) throw aborted; // RunAbortedError / LLMLimitError surface to the CLI

    if (opts.synthesize !== false) {
      await this.synthesize();
    }
    return this.ctx;
  }

  private async dispatch(task: Task): Promise<void> {
    task.status = "running";
    const agent = this.registry.get(task.assignedAgent);
    log.step(task.assignedAgent, task.goal);

    try {
      let result = await agent.run(task, this.ctx);

      // QA gate: review flagged deliverables; one bounded re-run with fixes.
      if (task.qa) {
        result = await this.qaGate(task, agent, result);
      }

      task.status = "done";
      task.result = result.output;
      this.ctx.message(task.assignedAgent, "system", task.id, result.summary);
      log.ok(task.assignedAgent, result.summary);

      // Delegation: agents can spawn follow-up tasks.
      if (result.followUps?.length) {
        for (const f of result.followUps) {
          this.queue.add({ ...f, createdBy: task.id });
          log.info("orchestrator", `${task.assignedAgent} delegated → ${f.assignedAgent} (${f.type})`);
        }
      }
    } catch (err: any) {
      task.status = "failed";
      task.error = err?.message ?? String(err);
      log.error(task.assignedAgent, task.error!);
      await this.ctx.memory.log({
        level: "error",
        scope: task.assignedAgent,
        message: `Task failed: ${task.error}`,
        data: { taskId: task.id, type: task.type },
      });

      // A usage/session-limit hit must stop the whole pool, not just fail one task.
      if (err instanceof Error && err.name === "LLMLimitError") {
        throw err;
      }
      // Brand intelligence is the foundation — abort the whole run if it fails
      // (e.g. dead URL) rather than letting downstream agents hallucinate.
      if (task.assignedAgent === "brand-intelligence") {
        throw new RunAbortedError(task.error ?? "brand analysis failed");
      }
    }
  }

  /** Review a deliverable; if below threshold, re-run the agent once with notes. */
  private async qaGate(task: Task, agent: ReturnType<AgentRegistry["get"]>, result: AgentResult): Promise<AgentResult> {
    const threshold = Number(process.env.QA_THRESHOLD || 80);
    try {
      const review = await this.registry.qa.review(task.type, result.output, agent.rubric);
      log.info("qa", `${task.type}: scored ${review.score}/100 (${review.pass ? "pass" : "needs work"})`);
      if (review.score >= threshold || review.issues.length === 0) return result;

      log.step("qa", `Re-running ${task.assignedAgent} with ${review.issues.length} required fixes`);
      const revised = await agent.run(
        { ...task, input: { ...task.input, revisionNotes: review.issues.map((i) => `- ${i}`).join("\n") } },
        this.ctx
      );
      return revised;
    } catch (err: any) {
      if (err instanceof Error && err.name === "LLMLimitError") throw err;
      log.warn("qa", `QA review skipped (${err?.message ?? err})`);
      return result;
    }
  }

  /** Run the CMO synthesis as a final, dependency-free step. */
  private async synthesize(): Promise<void> {
    const synthTask: Task = {
      id: "synthesis",
      type: "cmo.synthesize",
      goal: "Synthesize the executive summary",
      assignedAgent: "cmo",
      priority: 0,
      dependsOn: [],
      status: "running",
      createdAt: new Date().toISOString(),
    };
    log.step("cmo", "Synthesizing executive summary");
    try {
      const result = await this.registry.cmo.run(synthTask, this.ctx);
      log.ok("cmo", result.summary);
    } catch (err: any) {
      log.error("cmo", err?.message ?? String(err));
    }
  }

  /** Plan + run the full pipeline for a URL in one call. */
  static async runFullPipeline(memory: MemoryStore, goal: string, url?: string): Promise<SharedContext> {
    const orch = new Orchestrator(memory, goal);
    orch.enqueuePlan(orch.registry.cmo.plan(url));
    return orch.run();
  }

  /** Expose for single-step CLI commands. */
  get context(): SharedContext {
    return this.ctx;
  }
  get agents(): AgentRegistry {
    return this.registry;
  }
  summary(): { done: number; failed: number; skipped: number } {
    return {
      done: this.queue.byStatus("done").length,
      failed: this.queue.byStatus("failed").length,
      skipped: this.queue.byStatus("skipped").length,
    };
  }
}
