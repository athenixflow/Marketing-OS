import { request } from "undici";
import { scrape, type ScrapedPage } from "./scraper.js";
import { log } from "../../utils/logger.js";

export interface CrawlResult {
  startUrl: string;
  pages: ScrapedPage[];
  /** True when total text yield was very low (likely a JS-rendered SPA). */
  lowYield: boolean;
}

const MAX_PAGES = Number(process.env.CRAWL_MAX_PAGES || 12);
const TIMEOUT_MS = Number(process.env.CRAWL_TIMEOUT_MS || 15000);

/** Words in a path that signal a high-value page worth prioritizing. */
const PRIORITY_HINTS = /(about|product|service|pricing|plans|features|solutions|shop|contact|faq)/i;

/**
 * Breadth-first crawler scoped to a single domain. Fetches the start page,
 * then follows same-host links (prioritizing high-value pages) up to MAX_PAGES.
 * Pure HTTP + cheerio — no JS rendering — so SPA-only content is flagged.
 */
export async function crawl(startUrl: string): Promise<CrawlResult> {
  const origin = new URL(startUrl).origin;
  const seen = new Set<string>();
  const queue: string[] = [normalize(startUrl)];
  const pages: ScrapedPage[] = [];

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    const html = await fetchHtml(url);
    if (!html) continue;

    const page = scrape(url, html);
    pages.push(page);
    log.info("crawler", `fetched ${url} (${page.textLength} chars)`);

    // Enqueue same-origin links, priority pages first.
    const candidates = page.links
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

  const totalText = pages.reduce((n, p) => n + p.textLength, 0);
  const lowYield = pages.length > 0 && totalText / pages.length < 300;
  if (lowYield) {
    log.warn("crawler", "Low text yield — site may be JS-rendered; results may be partial.");
  }

  return { startUrl, pages, lowYield };
}

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
