/** Turn a URL or arbitrary name into a filesystem-safe project slug. */
export function slugify(input: string): string {
  let s = input.trim().toLowerCase();

  // If it looks like a URL, reduce to the hostname.
  try {
    if (/^https?:\/\//.test(s)) {
      s = new URL(s).hostname;
    }
  } catch {
    /* fall through and slugify the raw string */
  }

  return s
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "project";
}

/** Normalize a user-supplied URL into a full https URL. */
export function normalizeUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//.test(s)) s = `https://${s}`;
  // Throws if still invalid — caller decides how to handle.
  return new URL(s).toString();
}
