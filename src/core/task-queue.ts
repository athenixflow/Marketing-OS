import { randomUUID } from "node:crypto";
import type { AgentName, NewTask, Task } from "./types.js";

/**
 * Priority queue with dependency awareness.
 *
 * - Tasks are ordered by priority (lower runs first), then insertion order.
 * - next() returns the highest-priority task whose dependencies are all done,
 *   or null if nothing is currently runnable.
 * - The routing table maps a task `type` prefix to a default agent, so callers
 *   can enqueue work without always naming the agent explicitly.
 */
export class TaskQueue {
  private tasks: Task[] = [];
  private seq = 0;

  /** type-prefix -> default agent. Most specific (longest) match wins. */
  static readonly ROUTES: Array<{ prefix: string; agent: AgentName }> = [
    { prefix: "brand.", agent: "brand-intelligence" },
    { prefix: "competitor.", agent: "competitor-research" },
    { prefix: "audience.", agent: "audience-research" },
    { prefix: "strategy.", agent: "marketing-strategy" },
    { prefix: "funnel.", agent: "funnel-strategy" },
    { prefix: "seo.", agent: "seo-strategy" },
    { prefix: "content.research", agent: "content-research" },
    { prefix: "content.", agent: "content-creation" },
    { prefix: "copy.", agent: "copywriting" },
    { prefix: "creative.", agent: "creative-director" },
    { prefix: "image.", agent: "image-generation" },
    { prefix: "cro.", agent: "cro" },
    { prefix: "analytics.", agent: "analytics" },
  ];

  /** Resolve which agent should own a task type. */
  static route(type: string): AgentName | null {
    const match = TaskQueue.ROUTES
      .filter((r) => type.startsWith(r.prefix))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0];
    return match?.agent ?? null;
  }

  /** Add a task. Fills in id/status/priority defaults and resolves routing. */
  add(spec: NewTask & { createdBy?: string }): Task {
    const agent = spec.assignedAgent ?? TaskQueue.route(spec.type);
    if (!agent) throw new Error(`No agent route for task type "${spec.type}"`);

    const task: Task = {
      id: randomUUID().slice(0, 8),
      type: spec.type,
      goal: spec.goal,
      assignedAgent: agent,
      priority: spec.priority ?? 100,
      dependsOn: spec.dependsOn ?? [],
      input: spec.input,
      status: "pending",
      createdAt: new Date().toISOString(),
      createdBy: spec.createdBy,
      // Stable tiebreak for equal priorities.
      ...({ _seq: this.seq++ } as Record<string, number>),
    };
    this.tasks.push(task);
    return task;
  }

  /** Add many at once, returning the created tasks. */
  addMany(specs: Array<NewTask & { createdBy?: string }>): Task[] {
    return specs.map((s) => this.add(s));
  }

  /** Highest-priority runnable task (deps satisfied), or null. */
  next(): Task | null {
    const doneIds = new Set(this.tasks.filter((t) => t.status === "done").map((t) => t.id));

    const runnable = this.tasks
      .filter((t) => t.status === "pending")
      .filter((t) => t.dependsOn.every((d) => doneIds.has(d)));

    if (runnable.length === 0) return null;

    runnable.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (a as any)._seq - (b as any)._seq;
    });
    return runnable[0];
  }

  /** True while any task is still pending (whether or not currently runnable). */
  hasPending(): boolean {
    return this.tasks.some((t) => t.status === "pending");
  }

  /** Detect pending tasks blocked by deps that can never complete (deadlock). */
  blockedTasks(): Task[] {
    const terminal = new Set(["done"]);
    const resolvable = new Set(
      this.tasks.filter((t) => t.status === "pending" || terminal.has(t.status)).map((t) => t.id)
    );
    return this.tasks
      .filter((t) => t.status === "pending")
      .filter((t) => t.dependsOn.some((d) => !resolvable.has(d)));
  }

  all(): readonly Task[] {
    return this.tasks;
  }

  byStatus(status: Task["status"]): Task[] {
    return this.tasks.filter((t) => t.status === status);
  }
}
