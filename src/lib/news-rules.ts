/** Free, rule-based news fact extraction (no AI). Pure; shared by the reader and tests. */
export type RuleFact = { category: string; status: string; importance: number; impact: string; sentiment: "negative" | "positive" | "neutral" };

const RULES: Array<{ category: string; re: RegExp; importance: number; sentiment: RuleFact["sentiment"] }> = [
  { category: "injury", re: /\b(ruled out|out for (?:the season|\d+|several|weeks|months)|injur(?:y|ed|ies)|hamstring|knee|ankle|groin|calf|muscle (?:problem|injury)|ACL|fracture|surgery|sidelined|doubt(?:ful)? for)\b/i, importance: 4, sentiment: "negative" },
  { category: "injury", re: /\b(returns? from injury|back in training|fit again|passed fit|available again|recovered)\b/i, importance: 3, sentiment: "positive" },
  { category: "suspension", re: /\b(suspend(?:ed|sion)|banned|red card|sent off|serve a ban|accumulat(?:ed|ion) of yellow)\b/i, importance: 4, sentiment: "negative" },
  { category: "manager", re: /\b(sacked|fired|dismissed|parted ways|new (?:head coach|manager)|appointed|interim (?:boss|manager|coach)|resign(?:ed|s))\b/i, importance: 4, sentiment: "neutral" },
  { category: "lineup", re: /\b(starting (?:xi|line-?up)|team news|rotation|rested|bench(?:ed)?|predicted line-?up|confirmed line-?up)\b/i, importance: 3, sentiment: "neutral" },
  { category: "transfer", re: /\b(signs?|signed|joins?|joined|loan move|transfer|completes? move|agreed a fee)\b/i, importance: 2, sentiment: "neutral" },
  { category: "club_statement", re: /\b(club statement|official statement|announced|confirmed by the club)\b/i, importance: 3, sentiment: "neutral" },
];
const OFFICIAL = /\b(club (?:has )?confirmed|officially|official statement|announced|confirmed (?:by|that))\b/i;
const RUMOUR = /\b(reportedly|rumou?r|could|may|might|set to|linked with|according to sources|understood to)\b/i;

/** Split into sentences, match each against rules; one fact per sentence, deduped. */
export function extractRuleFacts(text: string, limit = 12): RuleFact[] {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z"'“])/).map((s) => s.trim()).filter((s) => s.length >= 25 && s.length <= 400);
  const out: RuleFact[] = [];
  for (const s of sentences) {
    const rule = RULES.find((r) => r.re.test(s));
    if (!rule) continue;
    const status = OFFICIAL.test(s) ? "official" : RUMOUR.test(s) ? "rumour" : "reported";
    const importance = Math.max(1, Math.min(5, rule.importance + (status === "official" ? 1 : status === "rumour" ? -1 : 0)));
    if (out.some((f) => f.impact === s)) continue;
    out.push({ category: rule.category, status, importance, impact: s, sentiment: rule.sentiment });
    if (out.length >= limit) break;
  }
  return out;
}
