/** Real bookmaker odds from The Odds API -> immutable odds_snapshots rows. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SPORTS = [
  "soccer_epl", "soccer_spain_la_liga", "soccer_italy_serie_a", "soccer_germany_bundesliga",
  "soccer_france_ligue_one", "soccer_netherlands_eredivisie", "soccer_portugal_primeira_liga",
  "soccer_uefa_champs_league", "soccer_uefa_europa_league", "soccer_turkey_super_league",
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|cf|afc|sc|ac|ssc|as|club|de)\b/g, "").replace(/[^a-z0-9]/g, "");

interface OddsEvent {
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: { key: string; markets: { key: string; outcomes: { name: string; price: number; point?: number }[] }[] }[];
}

export async function ingestOdds() {
  const key = process.env["ODDS_API_KEY"];
  if (!key) return { ok: false, error: "ODDS_API_KEY is not configured" };

  const from = new Date(Date.now() - 3 * 3600e3).toISOString();
  const to = new Date(Date.now() + 3 * 86400e3).toISOString();
  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("id, kickoff_at, status, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)")
    .gte("kickoff_at", from).lte("kickoff_at", to);

  let inserted = 0, unmatched = 0;
  const errors: string[] = [];
  for (const sport of SPORTS) {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${key}&regions=eu&markets=h2h,totals&oddsFormat=decimal`;
    const res = await fetch(url);
    if (!res.ok) { errors.push(`${sport} [${res.status}]: ${await res.text()}`); continue; }
    const events = (await res.json()) as OddsEvent[];
    for (const ev of events) {
      const t = new Date(ev.commence_time).getTime();
      const m = (matches ?? []).find((x) => {
        const h = norm((x.home as { name: string } | null)?.name ?? "");
        const a = norm((x.away as { name: string } | null)?.name ?? "");
        const eh = norm(ev.home_team), ea = norm(ev.away_team);
        return Math.abs(new Date(x.kickoff_at).getTime() - t) < 3 * 3600e3 &&
          (h.includes(eh) || eh.includes(h)) && (a.includes(ea) || ea.includes(a));
      });
      if (!m) { unmatched++; continue; }
      const mins = (t - Date.now()) / 60000;
      const phase = mins <= 5 ? "closing" : mins <= 75 ? "t60" : "pre";
      const rows = ev.bookmakers.flatMap((b) => b.markets.flatMap((mk) => mk.outcomes.map((o) => ({
        match_id: m.id, bookmaker: b.key, market: mk.key,
        selection: mk.key === "h2h" ? (o.name === ev.home_team ? "home" : o.name === ev.away_team ? "away" : "draw") : o.name.toLowerCase(),
        line: o.point ?? null, price: o.price, phase,
      }))));
      if (rows.length) {
        const { error } = await supabaseAdmin.from("odds_snapshots").insert(rows);
        if (error) errors.push(error.message); else inserted += rows.length;
      }
    }
  }
  return { ok: errors.length === 0, inserted, unmatched, errors };
}

/** Remove bookmaker margin from a set of decimal prices -> fair probabilities. */
export function demargin(prices: number[]): number[] {
  const inv = prices.map((p) => 1 / p);
  const sum = inv.reduce((a, b) => a + b, 0);
  return inv.map((x) => x / sum);
}
