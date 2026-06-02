import type { MemoryStore } from "../memory/store.js";
import type { AgentMessage, AgentName } from "./types.js";

/**
 * SharedContext is the in-memory scratchpad that every agent in a single run
 * can read and write. Durable facts go to MemoryStore; transient working state
 * and hand-off messages live here for the duration of one orchestration.
 */
export class SharedContext {
  readonly memory: MemoryStore;
  /** The top-level goal for this run (set by the CLI / CMO). */
  goal: string;
  /** Free-form blackboard agents use to pass intermediate results around. */
  readonly blackboard = new Map<string, unknown>();
  /** Recorded hand-offs between agents, in order. */
  readonly messages: AgentMessage[] = [];

  constructor(memory: MemoryStore, goal: string) {
    this.memory = memory;
    this.goal = goal;
  }

  set(key: string, value: unknown): void {
    this.blackboard.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.blackboard.get(key) as T | undefined;
  }

  /** Record a hand-off message between agents (traceability). */
  message(from: AgentName | "system", to: AgentName | "system", taskId: string, summary: string): void {
    this.messages.push({ from, to, taskId, summary, at: new Date().toISOString() });
  }
}
