import { request } from "undici";
import { chromium, type Browser, type Page } from "playwright";
import { scrape, type ScrapedPage } from "./scraper.js";
import { log } from "../../utils/logger.js";

export interface CrawlResult {
  startUrl: string;
  pages: ScrapedPage[];
  /** True when total text yield was very low (likely an un-renderable page). */
  lowYield: boolean;
  /** How pages were fetched: "render" (headless Chromium) or "http" (fallback). */
  mode: "render" | "http";
}

const MAX_PAGES = Number(process.env.CRAWL_MAX_PAGES || 12);
const TIMEOUT_MS = Number(process.env.CRAWL_TIMEOUT_MS || 15000);
const RENDER = !/^(0|false|no)$/i.test(process.env.CRAWL_RENDER ?? "1");

/** Words in a path that signal a high-value page worth prioritizing. */
const PRIORITY_HINTS = /(about|product|service|pricing|plans|features|solutions|shop|contact|faq)/i;

/**
 * Breadth-first crawler scoped to a single domain.
 *
 * By default it renders each page in headless Chromium (Playwright) so
 * JavaScript-built sites (React/Vue/Wix/Framer/…) yield their real, fully-loaded
 * content — the same DOM a human sees. If the browser can't launch (binary
 * missing, sandbox, etc.) it transparently falls back to a plain `undici` fetch.
 * Set CRAWL_RENDER=0 to force the fast HTTP-only path.
 *
 * The public shape is unchanged, so the scraper/extractor/agents are unaffected.
 */
export async function crawl(startUrl: string): Promise<CrawlResult> {
  const origin = new URL(startUrl).origin;
  const seen = new Set<string>();
  const queue: string[] = [normalize(startUrl)];
  const pages: ScrapedPage[] = [];

  // Try to bring up a headless browser; fall back to HTTP if unavailable.
  let browser: Browser | null = null;
  let page: Page | null = null;
  let mode: "render" | "http" = "http";

  if (RENDER) {
    try {
      browser = await chromium.launch({ headless: true });
      page = await browser.newPage({
        userAgent: "MarketingOS-Bot/1.0 (+local research)",
      });
      mode = "render";
      log.info("crawler", "headless Chromium ready — rendering pages");
    } catch (err: any) {
      log.warn(
        "crawler",
        `headless browser unavailable (${err?.message ?? err}); falling back to HTTP fetch. ` +
          `Run "npx playwright install chromium" to enable rendering.`
      );
    }
  }

  try {
    while (queue.length > 0 && pages.length < MAX_PAGES) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);

      const html = page ? await renderHtml(page, url) : await fetchHtml(url);
      if (!html) continue;

      const scraped = scrape(url, html);
      pages.push(scraped);
      log.info("crawler", `${mode === "render" ? "rendered" : "fetched"} ${url} (${scraped.textLength} chars)`);

      // Enqueue same-origin links, priority pages first.
      const candidates = scraped.links
        .map((l) => safeResolve(origin, url, l.href))
        .filter((u): u is string => Boolean(u))
        .filter((u) => u.startsWith(origin))
        .map(normalize)
        .filter((u) => !seen.has(u));

      const prioritized = [
        ...candidates.filter((u) => PRIORITY_HINTS.test(u)),
        ...candidates.filter((u) => !PRIORITY_HINTS.test(u)),
      ];
      for (const u of prioritized) {
        if (!queue.includes(u)) queue.push(u);
      }
    }
  } finally {
    await browser?.close().catch(() => {});
  }

  const totalText = pages.reduce((n, p) => n + p.textLength, 0);
  const lowYield = pages.length > 0 && totalText / pages.length < 300;
  if (lowYield) {
    log.warn("crawler", "Low text yield even after rendering — page may block bots or be empty.");
  }

  return { startUrl, pages, lowYield, mode };
}

/** Render a page in the headless browser and return its full DOM HTML. */
async function renderHtml(page: Page, url: string): Promise<string | null> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    // Best-effort wait for SPA network to settle; never let it hang the crawl.
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    return await page.content();
  } catch (err: any) {
    log.warn("crawler", `render failed ${url}: ${err?.message ?? err}`);
    return null;
  }
}

/** HTTP-only fallback fetch with manual redirect handling (undici). */
async function fetchHtml(url: string, redirectsLeft = 5): Promise<string | null> {
  try {
    const res = await request(url, {
      method: "GET",
      headers: { "user-agent": "MarketingOS-Bot/1.0 (+local research)" },
      headersTimeout: TIMEOUT_MS,
      bodyTimeout: TIMEOUT_MS,
    });

    // Follow redirects manually (undici's request does not by default).
    if (res.statusCode >= 300 && res.statusCode < 400 && redirectsLeft > 0) {
      const location = res.headers["location"];
      const loc = Array.isArray(location) ? location[0] : location;
      res.body.destroy();
      if (loc) return fetchHtml(new URL(loc, url).toString(), redirectsLeft - 1);
      return null;
    }
    if (res.statusCode >= 400) {
      log.warn("crawler", `skip ${url} (HTTP ${res.statusCode})`);
      return null;
    }
    const ct = String(res.headers["content-type"] || "");
    if (ct && !ct.includes("html")) {
      res.body.destroy();
      return null;
    }
    return await res.body.text();
  } catch (err: any) {
    log.warn("crawler", `failed ${url}: ${err?.message ?? err}`);
    return null;
  }
}

/** Strip hash + trailing slash so we don't crawl the same page twice. */
function normalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}

function safeResolve(origin: string, base: string, href: string): string | null {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return null;
  }
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
