import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readJson,
  writeJson,
  writeText,
  appendJsonl,
  ensureDir,
  listDirs,
} from "../utils/fs-json.js";
import type { LogEvent, Project } from "../core/types.js";
import { EMPTY, type MemoryKind } from "./schema.js";

/** Repo root = two levels up from src/memory/. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = path.join(ROOT, "data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const GLOBAL_DIR = path.join(DATA_DIR, "global");

/**
 * File-based persistent memory. One MemoryStore is scoped to one project, but
 * it can also read/write the cross-project `global/` namespace so learnings
 * accumulate over time.
 *
 * Everything lives under data/ as readable JSON — open any file to inspect it.
 */
export class MemoryStore {
  readonly project: Project;
  private readonly dir: string;

  private constructor(project: Project) {
    this.project = project;
    this.dir = path.join(PROJECTS_DIR, project.slug);
  }

  /** Load an existing project or create a new one. */
  static async open(slug: string, name?: string, url?: string): Promise<MemoryStore> {
    const metaFile = path.join(PROJECTS_DIR, slug, "project.json");
    const now = new Date().toISOString();
    let project = await readJson<Project | null>(metaFile, null);

    if (!project) {
      project = { slug, name: name ?? slug, url, createdAt: now, updatedAt: now };
    } else {
      project.updatedAt = now;
      if (name) project.name = name;
      if (url) project.url = url;
    }
    await writeJson(metaFile, project);
    await MemoryStore.setActive(slug);
    return new MemoryStore(project);
  }

  /** Remember which project the next no-URL command should operate on. */
  static async setActive(slug: string): Promise<void> {
    await writeJson(path.join(DATA_DIR, "active.json"), { slug });
  }

  /** The most recently used project slug, or null if none. */
  static async getActive(): Promise<string | null> {
    const data = await readJson<{ slug?: string }>(path.join(DATA_DIR, "active.json"), {});
    return data.slug ?? null;
  }

  /** List all known project slugs. */
  static async listProjects(): Promise<Project[]> {
    const slugs = await listDirs(PROJECTS_DIR);
    const projects: Project[] = [];
    for (const slug of slugs) {
      const meta = await readJson<Project | null>(
        path.join(PROJECTS_DIR, slug, "project.json"),
        null
      );
      if (meta) projects.push(meta);
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private file(kind: MemoryKind): string {
    return path.join(this.dir, `${kind}.json`);
  }

  /** Read a memory record (typed by caller), defaulting to the empty shape. */
  async get<T>(kind: MemoryKind): Promise<T> {
    return readJson<T>(this.file(kind), EMPTY[kind] as T);
  }

  /** Replace a memory record wholesale. Stamps updatedAt. */
  async set<T extends object>(kind: MemoryKind, data: T): Promise<void> {
    await writeJson(this.file(kind), { ...data, updatedAt: new Date().toISOString() });
  }

  /** Shallow-merge a partial update into an existing record. */
  async merge<T extends object>(kind: MemoryKind, patch: Partial<T>): Promise<T> {
    const current = await this.get<T>(kind);
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() } as T;
    await writeJson(this.file(kind), next);
    return next;
  }

  /**
   * Naive keyword/recency query over a record kind. Flattens the JSON to a
   * string and scores by how many query terms appear. Good enough for a local
   * file store; swap for a vector index later behind this same method.
   */
  async query(
    kind: MemoryKind,
    opts: { text?: string; limit?: number } = {}
  ): Promise<unknown> {
    const data = await this.get<unknown>(kind);
    if (!opts.text) return data;

    const terms = opts.text.toLowerCase().split(/\s+/).filter(Boolean);
    const score = (obj: unknown): number => {
      const hay = JSON.stringify(obj).toLowerCase();
      return terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    };

    if (Array.isArray(data)) {
      return [...data]
        .map((item) => ({ item, s: score(item) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, opts.limit ?? 10)
        .map((x) => x.item);
    }
    return data;
  }

  /** Persist a generated asset (markdown/json/text) under assets/. */
  async recordAsset(name: string, content: string): Promise<string> {
    const file = path.join(this.dir, "assets", name);
    await writeText(file, content);
    return file;
  }

  /** Read a previously written JSON asset, or a fallback if it's missing. */
  async readAssetJson<T>(name: string, fallback: T): Promise<T> {
    return readJson<T>(path.join(this.dir, "assets", name), fallback);
  }

  /** Append one structured event to the project run-log (JSONL audit trail). */
  async log(event: Omit<LogEvent, "at">): Promise<void> {
    const full: LogEvent = { ...event, at: new Date().toISOString() };
    await appendJsonl(path.join(this.dir, "run-log.jsonl"), full);
  }

  // ---- Global (cross-project) namespace ----------------------------------

  /** Read a value from cross-project global memory. */
  async getGlobal<T>(key: string, fallback: T): Promise<T> {
    return readJson<T>(path.join(GLOBAL_DIR, `${key}.json`), fallback);
  }

  /** Write a value to cross-project global memory. */
  async setGlobal<T>(key: string, value: T): Promise<void> {
    await writeJson(path.join(GLOBAL_DIR, `${key}.json`), value);
  }

  /** Absolute path to this project's data folder (for messages to the user). */
  get path(): string {
    return this.dir;
  }
}

export { DATA_DIR, PROJECTS_DIR, GLOBAL_DIR };
export async function ensureDataDirs(): Promise<void> {
  await ensureDir(PROJECTS_DIR);
  await ensureDir(GLOBAL_DIR);
}
