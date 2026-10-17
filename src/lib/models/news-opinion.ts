/**
 * Pure "news read" for one match: turns AI-tagged headlines into a per-team opinion.
 * Only official/reported items count as evidence; rumours are listed but never weigh in.
 * It never changes probabilities — callers may only add a reason line or lower confidence.
 */
export type NewsFact = { category: string; status: string; importance: number; impact: string; sentiment?: string; team_ids?: string[] };
export type NewsItem = { title: string; category: string | null; status: string | null; importance: number | null; impact: string | null; team_ids: string[] | null; published_at: string | null; news_facts?: unknown; detailed_analyzed_at?: string | null };
export type TeamNewsRead = { negatives: string[]; positives: string[]; rumours: number };
export type NewsOpinion = { home: TeamNewsRead; away: TeamNewsRead; total: number; tagged: number; opinion: string };

const NEGATIVE = new Set(["injury", "suspension", "manager"]);
const POSITIVE = new Set(["lineup", "transfer"]);

export function newsOpinion(items: NewsItem[], homeId: string, awayId: string, homeName: string, awayName: string): NewsOpinion {
  const read = (): TeamNewsRead => ({ negatives: [], positives: [], rumours: 0 });
  const home = read(), away = read();
  let tagged = 0;
  for (const item of items) {
    if (item.category) tagged++;
    const facts = Array.isArray(item.news_facts) ? item.news_facts as NewsFact[] : [];
    const entries = facts.length ? facts.map((f) => ({ ...item, ...f, team_ids: f.team_ids ?? [] })) : [item];
    for (const n of entries) {
    if (!n.category) continue;
    const sides = [n.team_ids?.includes(homeId) ? home : null, n.team_ids?.includes(awayId) ? away : null].filter(Boolean) as TeamNewsRead[];
    for (const t of sides) {
      if (n.status === "rumour") { t.rumours++; continue; }
      if (n.status !== "official" && n.status !== "reported") continue;
      if ((n.importance ?? 0) < 3) continue;
      const line = n.impact?.trim() || n.title;
      const sentiment = "sentiment" in n ? n.sentiment : undefined;
      if ((sentiment === "negative" || (!sentiment && NEGATIVE.has(n.category))) && !t.negatives.includes(line)) t.negatives.push(line);
      else if ((sentiment === "positive" || (!sentiment && POSITIVE.has(n.category))) && !t.positives.includes(line)) t.positives.push(line);
    }
    }
  }
  const parts: string[] = [];
  const say = (name: string, t: TeamNewsRead) => {
    if (t.negatives.length) parts.push(`${name} has ${t.negatives.length} confirmed/reported setback${t.negatives.length > 1 ? "s" : ""} (${t.negatives[0]})`);
    if (t.positives.length) parts.push(`${name} has good news (${t.positives[0]})`);
  };
  say(homeName, home); say(awayName, away);
  const opinion = tagged === 0
    ? (items.length ? "Headlines found but not yet read by the AI." : "No news found for either team this week.")
    : parts.length ? parts.join("; ") + "." : "News this week contains nothing that should affect this match.";
  return { home, away, total: items.length, tagged, opinion };
}

/** Which side a pick code backs, or null for totals/BTTS. */
export function backedSide(code: string): "home" | "away" | null {
  if (["home", "dc_home", "dnb_home", "home_over15"].includes(code)) return "home";
  if (["away", "dc_away", "dnb_away", "away_over15"].includes(code)) return "away";
  return null;
}
