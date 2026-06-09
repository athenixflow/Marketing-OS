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
| **CMO** | Plans the work, delegates to specialists, writes the executive directive |
| Brand Intelligence | Renders + analyzes the website (products, services, offers, CTAs, voice) |
| **Market Research / Data** | TAM/SAM/SOM, growth, benchmarks — **web-sourced + cited** |
| Competitor Research | Real competitors + positioning whitespace — **web-sourced + cited** |
| Audience Research | Segments + buyer personas — **web-sourced + cited** |
| Marketing Strategy | Positioning, 30/60/90, channels, KPIs, **risk register** |
| **Financial / Unit-Economics** | CAC/LTV, budget allocation, projection, sensitivity |
| Funnel Strategy | Full-funnel journey, lead magnets, nurture sequence |
| SEO Strategy | Keyword clusters by intent — **web-sourced** |
| Content Research | Current trends, topics, hooks — **web-sourced** |
| Content Creation | Content pillars + a dated calendar |
| Copywriting | Captions, video scripts, blog posts |
| Creative Director | Creative brief, visual strategy, design direction |
| Image Generation | Ready-to-paste text-to-image prompts |
| CRO | Website / CTA / UX / funnel audit + recommendations |
| Analytics | North-star metric, KPI dashboard, experiment backlog |
| **QA / Managing Director** | Scores deliverables vs a rubric; cross-deliverable consistency review |
| **Report Builder** | Compiles everything into one board-ready report + sources appendix |

### Institutional-grade by design

- **Web-grounded + cited.** Research agents use live web search and attach sources (`RESEARCH_WEB=0` to disable).
- **Draft → critique → revise.** Every deliverable is self-critiqued against a rubric and revised before it's saved.
- **QA gate.** A Managing-Director agent scores the strategy and financials; anything below `QA_THRESHOLD` (default 80) is re-run with required fixes.
- **Board-ready output.** `report` compiles a single `strategy-report.md` (exec summary → methodology → market → competitive → audience → strategy → 30/60/90 → financials → KPIs → risk register → sources) plus `sources.json`.

---

## Commands

```bash
npm run os -- init <url>        # create/select a project + analyze the site
npm run os -- analyze <url>     # brand + competitor + audience research (web-grounded)
npm run os -- market            # market sizing, trends, benchmarks (web-grounded)
npm run os -- strategy          # market + 30/60/90 strategy + financials + analytics
npm run os -- financials        # unit economics, budget, projection, sensitivity
npm run os -- content           # research + pillars + calendar + copy
npm run os -- creative          # creative platform + image prompts
npm run os -- cro [url]         # conversion-rate-optimization audit
npm run os -- qa                # cross-deliverable consistency review
npm run os -- report            # compile the board-ready report + sources.json
npm run os -- run <url>         # FULL institutional pipeline end-to-end
npm run os -- memory <kind>     # print stored memory (brand, market, strategy, ...)
npm run os -- projects          # list all projects
```

### Recommended operating mode: staged, not one marathon

Institutional rigor (web research + draft→critique→revise + QA gate + 18 agents) makes a
full `run` long (~1–2 hrs) and heavy on subscription usage, with real session-limit risk in
one sitting. Every phase is independently runnable and resumable, so the durable workflow is:

```bash
npm run os -- init https://acme.com   # also enforces the dead-URL guard
npm run os -- market
npm run os -- analyze https://acme.com
npm run os -- strategy                # strategy + financials (QA-gated) + funnel/seo/analytics
npm run os -- content
npm run os -- creative
npm run os -- cro
npm run os -- qa
npm run os -- report                  # → data/projects/<slug>/assets/strategy-report.md
```

…or `npm run os -- run https://acme.com` to do everything in one pass. If a session limit
is hit mid-run, nothing is corrupted — just resume the affected stage once it resets.

### Speed

Independent agents run **in parallel** (e.g. market/competitor/audience after brand;
financials/funnel/seo/creative after strategy), so a run finishes ~2.5× faster than
serial with identical output. Tune with `MOS_CONCURRENCY` (default 3; set `1` to fully
serialize if you hit subscription burst limits). The rendered crawl is cached to
`crawl-pages.json`, so the CRO audit and re-runs don't re-render the site.

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
