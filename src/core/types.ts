/**
 * Shared types for the whole system. Everything that crosses a module boundary
 * is defined here so the data shapes stay in one obvious place.
 */

/** The canonical names of every agent. Used for routing + delegation. */
export type AgentName =
  | "cmo"
  | "brand-intelligence"
  | "competitor-research"
  | "audience-research"
  | "marketing-strategy"
  | "funnel-strategy"
  | "seo-strategy"
  | "content-research"
  | "content-creation"
  | "creative-director"
  | "image-generation"
  | "cro"
  | "copywriting"
  | "analytics";

/** Priority for task ordering. Lower number = runs sooner. */
export type Priority = number;

export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

/** A unit of work assigned to a single agent. */
export interface Task {
  id: string;
  /** Logical type used by the routing table (e.g. "brand.analyze"). */
  type: string;
  /** Human-readable instruction for the agent. */
  goal: string;
  /** Which agent should handle this task. */
  assignedAgent: AgentName;
  priority: Priority;
  /** IDs of tasks that must complete before this one runs. */
  dependsOn: string[];
  /** Arbitrary structured input for the agent. */
  input?: Record<string, unknown>;
  status: TaskStatus;
  /** Result produced by the agent, once done. */
  result?: unknown;
  error?: string;
  createdAt: string;
  /** Which task/agent created this one (for the delegation trail). */
  createdBy?: string;
}

/** A hand-off message recorded between agents for traceability. */
export interface AgentMessage {
  from: AgentName | "system";
  to: AgentName | "system";
  taskId: string;
  summary: string;
  at: string;
}

/** What an agent returns from run(). */
export interface AgentResult {
  /** Structured output written to memory / returned to the orchestrator. */
  output: unknown;
  /** Short human summary for logs + the final report. */
  summary: string;
  /** Optional follow-up tasks the agent wants to delegate. */
  followUps?: NewTask[];
}

/** A task spec before it is assigned an id/status (used when delegating). */
export interface NewTask {
  type: string;
  goal: string;
  assignedAgent: AgentName;
  priority?: Priority;
  dependsOn?: string[];
  input?: Record<string, unknown>;
}

/** A project is one brand/website we are doing marketing for. */
export interface Project {
  slug: string;
  name: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

/** A single entry in the run log (JSONL audit trail). */
export interface LogEvent {
  at: string;
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  data?: unknown;
}
