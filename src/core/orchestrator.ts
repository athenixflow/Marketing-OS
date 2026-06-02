import { TaskQueue } from "./task-queue.js";
import { AgentRegistry } from "./registry.js";
import { SharedContext } from "./context.js";
import type { PlannedTask } from "../agents/cmo-agent.js";
import type { MemoryStore } from "../memory/store.js";
import type { AgentName, NewTask, Task } from "./types.js";
import { log } from "../utils/logger.js";

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

  /** Drain the queue, then synthesize. Returns the final context. */
  async run(opts: { synthesize?: boolean } = {}): Promise<SharedContext> {
    while (this.queue.hasPending()) {
      const task = this.queue.next();

      if (!task) {
        // Nothing runnable but tasks remain → unsatisfiable dependencies.
        const blocked = this.queue.blockedTasks();
        for (const b of blocked) {
          b.status = "skipped";
          log.warn("orchestrator", `skipped ${b.type} (blocked dependencies)`);
          await this.ctx.memory.log({
            level: "warn",
            scope: "orchestrator",
            message: `Skipped ${b.type} — dependencies could not be satisfied`,
          });
        }
        continue;
      }

      await this.dispatch(task);
    }

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
      const result = await agent.run(task, this.ctx);
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
