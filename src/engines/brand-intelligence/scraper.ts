import * as cheerio from "cheerio";

/** Clean, structured content extracted from a single HTML page. */
export interface ScrapedPage {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  /** Visible body text, whitespace-collapsed and truncated. */
  text: string;
  /** Anchor text + href for links found on the page. */
  links: Array<{ text: string; href: string }>;
  /** Button / link text that looks like a call-to-action. */
  ctaCandidates: string[];
  /** Rough signal of how much real text we got (helps flag JS-only sites). */
  textLength: number;
}

const CTA_HINTS =
  /\b(buy|shop|get started|sign up|signup|subscribe|book|demo|try|start|join|download|contact|learn more|order|add to cart|claim|register|request)\b/i;

/** Parse raw HTML into a ScrapedPage. */
export function scrape(url: string, html: string): ScrapedPage {
  const $ = cheerio.load(html);

  // Remove noise before extracting text.
  $("script, style, noscript, svg, iframe").remove();

  const title = $("title").first().text().trim() || $("h1").first().text().trim();
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    "";

  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t) headings.push(t);
  });

  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);

  const links: Array<{ text: string; href: string }> = [];
  const ctaCandidates = new Set<string>();
  $("a, button").each((_, el) => {
    const $el = $(el);
    const t = $el.text().replace(/\s+/g, " ").trim();
    const href = $el.attr("href") || "";
    if (t && t.length < 80) {
      if (href) links.push({ text: t, href });
      if (CTA_HINTS.test(t)) ctaCandidates.add(t);
    }
  });

  return {
    url,
    title,
    metaDescription,
    headings: dedupe(headings).slice(0, 40),
    text,
    links: links.slice(0, 120),
    ctaCandidates: [...ctaCandidates].slice(0, 25),
    textLength: text.length,
  };
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
