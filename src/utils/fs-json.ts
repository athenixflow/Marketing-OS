import { promises as fs } from "node:fs";
import path from "node:path";

/** Ensure a directory exists (recursive, no error if present). */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Read JSON, returning a fallback if the file does not exist. */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

/** Write JSON with pretty formatting, creating parent dirs as needed. */
export async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

/** Append a single line to a JSONL file. */
export async function appendJsonl(file: string, obj: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.appendFile(file, JSON.stringify(obj) + "\n", "utf8");
}

/** Write an arbitrary text/markdown asset. */
export async function writeText(file: string, text: string): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, text, "utf8");
}

/** List subdirectory names of a directory (returns [] if missing). */
export async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}
