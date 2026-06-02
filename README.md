# MarketingOS

A local, AI-powered marketing department. Fourteen specialized agents — led by a
master **CMO Agent** — research a brand's website, build strategy, plan content,
develop creative, and audit conversion. Everything runs on your machine and writes
human-readable files you can open and inspect.

No database. No cloud. **No API key** — it runs on your Claude Code subscription.

---

## Quick start

```bash
# 1. Install dependencies
npm install --legacy-peer-deps
npx playwright install chromium   # one-time: headless browser for full-page crawling

# 2. Make sure you're logged into Claude Code
#    (you already are if you use Claude Code). MarketingOS uses that same login
#    via the Claude Agent SDK — no separate API key needed.

# 3. Run the full pipeline on any website
npm run os -- run https://example.com
```

Output lands in `data/projects/<site>/` — open the JSON and Markdown files to read it.

> **Auth:** MarketingOS calls Claude through the Claude Agent SDK, which uses the
> credentials from your logged-in Claude Code session. If you'd rather bill against
> the Anthropic API, set `ANTHROPIC_API_KEY` in `.env` and the SDK will use that.

---

## The agents

| Agent | Role |
|-------|------|
| **CMO** | Plans the work, delegates to specialists, writes the executive summary |
| Brand Intelligence | Crawls + analyzes the website (products, services, offers, CTAs, voice) |
| Competitor Research | Maps competitors and finds positioning whitespace |
| Audience Research | Builds audience segments and buyer personas |
| Marketing Strategy | 30/60/90-day plan, positioning, channels, KPIs |
| Funnel Strategy | Full-funnel journey, lead magnets, nurture sequence |
| SEO Strategy | Keyword clusters by intent, on-page + technical roadmap |
| Content Research | Trends, topics, and hook angles |
| Content Creation | Content pillars + a dated calendar |
| Copywriting | Captions, video scripts, blog posts |
| Creative Director | Creative brief, visual strategy, design direction |
| Image Generation | Ready-to-paste text-to-image prompts |
| CRO | Website / CTA / UX / funnel audit + recommendations |
| Analytics | North-star metric, KPI dashboard, experiment backlog |

---

## Commands

```bash
npm run os -- init <url>        # create/select a project + analyze the site
npm run os -- analyze <url>     # brand + competitor + audience research
npm run os -- strategy          # 30/60/90 strategy (uses active project)
npm run os -- content           # research + pillars + calendar + copy
npm run os -- creative          # creative platform + image prompts
npm run os -- cro [url]         # conversion-rate-optimization audit
npm run os -- run <url>         # FULL pipeline end-to-end
npm run os -- memory <kind>     # print stored memory (brand, strategy, ...)
npm run os -- projects          # list all projects
npm run os -- help              # show help
```

The single-step commands (`strategy`, `content`, `creative`) operate on the most
recently used project, so a typical flow is:

```bash
npm run os -- analyze https://acme.com
npm run os -- strategy
npm run os -- content
npm run os -- creative
npm run os -- cro
```

…or just `npm run os -- run https://acme.com` to do all of it at once.

---

## How it works

```
        ┌─────────────┐
        │  CMO Agent  │  plans tasks, delegates, synthesizes
        └──────┬──────┘
               │ enqueues prioritized, dependency-aware tasks
        ┌──────▼───────────┐
        │   Orchestrator   │  drains the task queue, dispatches to agents
        └──────┬───────────┘
   ┌───────────┼───────────────────────────────┐
   ▼           ▼                                ▼
Research    Strategy / Funnel / SEO        Content / Creative / CRO
   │           │                                │
   └───────────┴────────────► Shared Context + Memory Store ◄──────┘
                                      │
                              data/projects/<slug>/*.json
```

- **Agents** never call each other directly. They share state through an in-memory
  `SharedContext` (during a run) and the persistent `MemoryStore` (across runs).
- **Tasks** carry a priority and dependencies; the orchestrator only runs a task
  once its dependencies are done. Agents can delegate follow-up tasks back to the queue.
- **Memory** is plain JSON under `data/` and persists across projects. The
  `data/global/` namespace accumulates cross-project learnings.

---

## Project structure

```
src/
  cli.ts                 entry point + commands
  core/                  agent framework (types, llm, base-agent, orchestrator,
                         task-queue, registry, context)
  memory/                schema + file-based persistent store
  agents/                the 14 agents (one file each)
  engines/               domain logic: brand-intelligence, strategy, content,
                         creative, cro
  utils/                 slug, fs-json, logger, env
data/                    persisted memory + generated assets (gitignored)
```

---

## Notes

- **Website crawling** renders each page in headless Chromium (Playwright), so
  JavaScript-built sites (React/Vue/Wix/Framer/…) are scraped fully. The browser is
  installed once with `npx playwright install chromium`. If the browser can't launch,
  the crawler automatically falls back to plain HTTP fetch. Set `CRAWL_RENDER=0` to
  force the fast HTTP-only path.
- **Image generation** outputs ready-to-use prompts rather than calling an image
  model, so no extra API key is needed. You can wire an image model into the
  Image Generation Agent later.
- Auth runs through the Claude Agent SDK using your Claude Code login. If it can't
  authenticate, run `claude` once to log in (or set `ANTHROPIC_API_KEY`). Read-only
  commands (`projects`, `memory`) work regardless.

Type-check anytime with `npm run typecheck`.
