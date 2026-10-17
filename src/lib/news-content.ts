import { parseHTML } from "linkedom";

/** Publisher-only fetch targets: never follow arbitrary URLs found inside an article. */
export function allowedNewsUrl(raw: string, feed: string): boolean {
  try {
    const url = new URL(raw), source = new URL(feed);
    const host = (s: string) => s.toLowerCase().replace(/^www\./, "");
    const a = host(url.hostname), b = host(source.hostname);
    const family = b.endsWith("bbc.co.uk") ? ["bbc.co.uk", "bbc.com"]
      : [b.replace(/^feeds\./, "")];
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && family.some((h) => a === h || a.endsWith(`.${h}`));
  } catch { return false; }
}

export function articleText(html: string): string {
  const { document } = parseHTML(html);
  const bodies: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (typeof row["articleBody"] === "string") bodies.push(row["articleBody"]);
    if (row["@graph"]) visit(row["@graph"]);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent ?? "")); } catch { /* invalid publisher metadata */ }
  }
  for (const node of document.querySelectorAll("script,style,nav,footer,header,aside,form,[aria-hidden=true]")) node.remove();
  const root = document.querySelector('[itemprop="articleBody"], .article__body, .sdc-article-body, .article-body, article');
  if (root) bodies.push([...root.querySelectorAll("p,li,h2,h3")].map((p) => p.textContent?.trim() ?? "").filter(Boolean).join("\n"));
  return bodies.sort((a, b) => b.length - a.length)[0]?.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() ?? "";
}

export function newsChunks(text: string, size = 6000): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks.length ? chunks : [""];
}

export function newsWindow(kickoff: string, now = Date.now()) {
  const end = Math.min(new Date(kickoff).getTime(), now);
  return { start: new Date(end - 7 * 864e5).toISOString(), end: new Date(end).toISOString() };
}