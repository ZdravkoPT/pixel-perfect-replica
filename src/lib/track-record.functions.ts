import { createServerFn } from "@tanstack/react-start";
import { publicClient } from "./leagues.functions";

export type Bucket = { key: string; picks: number; hits: number; expected: number };
type Row = { market: string; pick_code: string; league: string | null; probability: number; result: string; kickoff_at: string; slip_type: string };

/** Hit rate of every settled AI pick, split by market, league, confidence and month. */
export const getTrackRecord = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("ai_bet_log").select("market, pick_code, league, probability, result, kickoff_at, slip_type")
      .in("result", ["hit", "miss"]).order("kickoff_at", { ascending: false }).range(from, from + 999);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  const group = (keyOf: (r: Row) => string) => {
    const m = new Map<string, Bucket>();
    for (const r of rows) {
      const k = keyOf(r);
      const b = m.get(k) ?? { key: k, picks: 0, hits: 0, expected: 0 };
      b.picks++; b.expected += Number(r.probability); if (r.result === "hit") b.hits++;
      m.set(k, b);
    }
    return [...m.values()].sort((a, b) => b.picks - a.picks);
  };
  const conf = (p: number) => (p >= 0.8 ? "80%+" : p >= 0.7 ? "70–80%" : p >= 0.6 ? "60–70%" : "under 60%");
  // Same rule the pick engine uses: last 30 settled picks of a market under 60%.
  const recent = new Map<string, boolean[]>();
  for (const r of rows) {
    const a = recent.get(r.market) ?? [];
    if (a.length < 30) a.push(r.result === "hit");
    recent.set(r.market, a);
  }
  const warnings = [...recent.entries()].filter(([, a]) => a.length >= 20 && a.filter(Boolean).length / a.length < 0.6)
    .map(([market, a]) => ({ market, recentHitRate: a.filter(Boolean).length / a.length, recentPicks: a.length }));
  return {
    total: rows.length, hits: rows.filter((r) => r.result === "hit").length,
    expected: rows.reduce((s, r) => s + Number(r.probability), 0),
    byMarket: group((r) => r.market),
    byLeague: group((r) => r.league ?? "Unknown").slice(0, 20),
    byConfidence: group((r) => conf(Number(r.probability))),
    byMonth: group((r) => r.kickoff_at.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key)),
    warnings,
  };
});
