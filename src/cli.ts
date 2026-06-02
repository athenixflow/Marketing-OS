import { loadEnv } from "./utils/env.js";
loadEnv(); // must run before anything reads process.env

import { MemoryStore, ensureDataDirs } from "./memory/store.js";
import { Orchestrator } from "./core/orchestrator.js";
import { isConfigured } from "./core/llm.js";
import { slugify, normalizeUrl } from "./utils/slug.js";
import { log } from "./utils/logger.js";
import type { MemoryKind } from "./memory/schema.js";
import type { NewTask } from "./core/types.js";

/** Parse "--flag value" pairs and positional args out of argv. */
function parseArgs(argv: string[]) {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

const HELP = `
MarketingOS — your local AI marketing department.

Usage: npm run os -- <command> [args]

Commands:
  init <url> [--name "Brand"]   Create/select a project and analyze the website
  analyze <url>                 Brand + competitor + audience research
  strategy                      Build 30/60/90 strategy (uses active project)
  content                       Content research + pillars + calendar + copy
  copy                          Rewrite captions, script, and blog from the calendar
  creative                      Creative platform + image prompts
  analytics                     Measurement plan + KPI dashboard
  cro [url]                     Conversion-rate-optimization audit
  summary                       Re-synthesize the executive summary
  run <url>                     FULL pipeline: research → strategy → content →
                                creative → CRO → executive summary
  memory <kind>                 Print stored memory (brand|audience|competitors|
                                strategy|content-calendar|campaigns)
  projects                      List all projects
  help                          Show this help

Setup: copy .env.example to .env and add ANTHROPIC_API_KEY.
`;

async function main() {
  const argv = process.argv.slice(2);
  const { positionals, flags } = parseArgs(argv);
  const command = positionals[0];
  await ensureDataDirs();

  if (!command || command === "help" || flags.help) {
    console.log(HELP);
    return;
  }

  // Commands that don't need the LLM.
  if (command === "projects") {
    const projects = await MemoryStore.listProjects();
    if (projects.length === 0) {
      log.info("projects", "No projects yet. Run: npm run os -- init <url>");
      return;
    }
    log.banner("Projects");
    for (const p of projects) {
      console.log(`  • ${p.slug}  —  ${p.name}${p.url ? `  (${p.url})` : ""}`);
    }
    return;
  }

  if (command === "memory") {
    const kind = (positionals[1] ?? "brand") as MemoryKind;
    const store = await openActive();
    const data = await store.get(kind);
    log.banner(`memory: ${kind} (${store.project.slug})`);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Everything below needs an API key.
  if (!isConfigured()) {
    log.error("config", "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
    process.exitCode = 1;
    return;
  }

  switch (command) {
    case "init": {
      const url = requireUrl(positionals[1]);
      const store = await MemoryStore.open(slugify(url), flags.name, url);
      log.banner(`MarketingOS — init ${store.project.name}`);
      await runTasks(store, `Understand the brand at ${url}`, [
        { type: "brand.analyze", goal: "Analyze the website", assignedAgent: "brand-intelligence", priority: 10, input: { url } },
      ]);
      done(store);
      break;
    }

    case "analyze": {
      const url = requireUrl(positionals[1]);
      const store = await MemoryStore.open(slugify(url), flags.name, url);
      log.banner(`MarketingOS — analyze ${store.project.name}`);
      await runTasks(store, `Research the brand and market at ${url}`, [
        { _ref: "brand", type: "brand.analyze", goal: "Analyze the website", assignedAgent: "brand-intelligence", priority: 10, input: { url } },
        { _ref: "comp", type: "competitor.discover", goal: "Map competitors", assignedAgent: "competitor-research", priority: 20, dependsOn: ["@brand"] },
        { _ref: "aud", type: "audience.research", goal: "Define audience", assignedAgent: "audience-research", priority: 20, dependsOn: ["@brand"] },
      ]);
      done(store);
      break;
    }

    case "strategy": {
      const store = await openActive();
      log.banner(`MarketingOS — strategy ${store.project.name}`);
      await runTasks(store, `Build the marketing strategy for ${store.project.name}`, [
        { type: "strategy.build", goal: "Build 30/60/90 strategy", assignedAgent: "marketing-strategy", priority: 10 },
        { _ref: "f", type: "funnel.design", goal: "Design funnel", assignedAgent: "funnel-strategy", priority: 20 },
        { _ref: "s", type: "seo.strategy", goal: "SEO strategy", assignedAgent: "seo-strategy", priority: 20 },
        { type: "analytics.plan", goal: "Measurement plan", assignedAgent: "analytics", priority: 30 },
      ]);
      done(store);
      break;
    }

    case "content": {
      const store = await openActive();
      log.banner(`MarketingOS — content ${store.project.name}`);
      await runTasks(store, `Build the content engine output for ${store.project.name}`, [
        { _ref: "r", type: "content.research", goal: "Research content", assignedAgent: "content-research", priority: 10 },
        { _ref: "c", type: "content.calendar", goal: "Build calendar", assignedAgent: "content-creation", priority: 20, dependsOn: ["@r"] },
        { type: "copy.write", goal: "Write copy", assignedAgent: "copywriting", priority: 30, dependsOn: ["@c"] },
      ]);
      done(store);
      break;
    }

    case "creative": {
      const store = await openActive();
      log.banner(`MarketingOS — creative ${store.project.name}`);
      await runTasks(store, `Develop the creative platform for ${store.project.name}`, [
        { _ref: "cr", type: "creative.develop", goal: "Creative platform", assignedAgent: "creative-director", priority: 10 },
        { type: "image.prompts", goal: "Image prompts", assignedAgent: "image-generation", priority: 20, dependsOn: ["@cr"] },
      ]);
      done(store);
      break;
    }

    case "cro": {
      const maybeUrl = positionals[1];
      const store = maybeUrl
        ? await MemoryStore.open(slugify(normalizeUrl(maybeUrl)), undefined, normalizeUrl(maybeUrl))
        : await openActive();
      const url = maybeUrl ? normalizeUrl(maybeUrl) : store.project.url;
      log.banner(`MarketingOS — CRO ${store.project.name}`);
      await runTasks(store, `Audit conversion for ${store.project.name}`, [
        { type: "cro.audit", goal: "CRO audit", assignedAgent: "cro", priority: 10, input: { url } },
      ]);
      done(store);
      break;
    }

    case "analytics": {
      const store = await openActive();
      log.banner(`MarketingOS — analytics ${store.project.name}`);
      await runTasks(store, `Build the measurement plan for ${store.project.name}`, [
        { type: "analytics.plan", goal: "Measurement plan", assignedAgent: "analytics", priority: 10 },
      ]);
      done(store);
      break;
    }

    case "copy": {
      const store = await openActive();
      log.banner(`MarketingOS — copy ${store.project.name}`);
      await runTasks(store, `Write sample copy for ${store.project.name}`, [
        { type: "copy.write", goal: "Write captions, a script, and a blog post", assignedAgent: "copywriting", priority: 10 },
      ]);
      done(store);
      break;
    }

    case "summary": {
      const store = await openActive();
      log.banner(`MarketingOS — summary ${store.project.name}`);
      await runTasks(store, `Synthesize the executive summary for ${store.project.name}`, [
        { type: "cmo.synthesize", goal: "Synthesize executive summary", assignedAgent: "cmo", priority: 10 },
      ]);
      done(store);
      break;
    }

    case "run": {
      const url = requireUrl(positionals[1]);
      const store = await MemoryStore.open(slugify(url), flags.name, url);
      log.banner(`MarketingOS — FULL RUN ${store.project.name}`);
      const orch = new Orchestrator(store, `Build the complete marketing plan for ${url}`);
      orch.enqueuePlan(orch.agents.cmo.plan(url));
      await orch.run();
      const s = orch.summary();
      log.ok("done", `${s.done} tasks done, ${s.failed} failed, ${s.skipped} skipped.`);
      done(store);
      break;
    }

    default:
      log.error("cli", `Unknown command "${command}".`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

// ---- helpers --------------------------------------------------------------

function requireUrl(input: string | undefined): string {
  if (!input) {
    log.error("cli", "This command needs a URL. Example: npm run os -- init https://example.com");
    process.exit(1);
  }
  return normalizeUrl(input);
}

async function openActive(): Promise<MemoryStore> {
  const slug = await MemoryStore.getActive();
  if (!slug) {
    log.error("cli", "No active project. Run: npm run os -- init <url>");
    process.exit(1);
  }
  return MemoryStore.open(slug);
}

/** Run a small ad-hoc plan (with @ref deps) without CMO synthesis. */
type CliTask = NewTask & { _ref?: string };
async function runTasks(store: MemoryStore, goal: string, tasks: CliTask[]) {
  const orch = new Orchestrator(store, goal);
  // Reuse the orchestrator's @ref resolution by shaping into PlannedTask-likes.
  orch.enqueuePlan(tasks.map((t, i) => ({ _ref: t._ref ?? `t${i}`, ...t })));
  await orch.run({ synthesize: false });
  const s = orch.summary();
  log.ok("done", `${s.done} done, ${s.failed} failed, ${s.skipped} skipped.`);
}

function done(store: MemoryStore) {
  log.info("output", `Memory + assets saved under: ${store.path}`);
}

main().catch((err) => {
  log.error("fatal", err?.stack ?? String(err));
  process.exitCode = 1;
});
