/**
 * Understat match xG (top-5 leagues + Russia) attached to our stored league
 * history. A match is matched by league + date (±1 day) + exact score, plus the
 * home team when both names resolve; ambiguous matches are skipped.
 */
import { buildTeamResolver } from "@/lib/team-resolver.server";

const LEAGUES: Array<[string, string]> = [["EPL", "E0"], ["La_liga", "SP1"], ["Bundesliga", "D1"], ["Serie_A", "I1"], ["Ligue_1", "F1"]];

type UMatch = { isResult: boolean; h: { title: string }; a: { title: string }; goals: { h: string; a: string }; xG: { h: string; a: string }; datetime: string };

export async function importUnderstat(opts: { seasons?: number[]; budgetMs?: number } = {}) {
  const t0 = Date.now();
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const resolve = await buildTeamResolver(sb);
  const y = new Date().getUTCFullYear();
  const startYear = new Date().getUTCMonth() >= 6 ? y : y - 1;
  const seasons = opts.seasons ?? [startYear, startYear - 1, startYear - 2, startYear - 3, startYear - 4];
  let matched = 0, skipped = 0;
  const errors: string[] = [];

  for (const [uLeague, code] of LEAGUES) {
    for (const s of seasons) {
      if (Date.now() - t0 > (opts.budgetMs ?? 100_000)) return { matched, skipped, errors, partial: true };
      let list: UMatch[] = [];
      try {
        const res = await fetch(`https://understat.com/getLeagueData/${uLeague}/${s}`, {
          headers: { "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest" },
        });
        if (!res.ok) { errors.push(`${uLeague} ${s}: ${res.status}`); continue; }
        list = ((await res.json()) as { dates?: UMatch[] }).dates ?? [];
      } catch (e) { errors.push(`${uLeague} ${s}: ${String(e)}`); continue; }
      const done = list.filter((m) => m.isResult && m.xG?.h != null);
      if (!done.length) continue;
      const dates = done.map((m) => m.datetime.slice(0, 10)).sort();
      const from = new Date(new Date(dates[0]!).getTime() - 86400e3).toISOString().slice(0, 10);
      const to = new Date(new Date(dates[dates.length - 1]!).getTime() + 86400e3).toISOString().slice(0, 10);
      const { data: hist } = await sb.from("historical_results")
        .select("id, match_date, home_team_id, home_goals, away_goals, home_xg")
        .eq("league_code", code).gte("match_date", from).lte("match_date", to).limit(1000);
      const byKey = new Map<string, Array<{ id: string; home_team_id: string | null; home_xg: number | null }>>();
      for (const h of hist ?? []) {
        const k = `${h.match_date}|${h.home_goals}-${h.away_goals}`;
        byKey.set(k, [...(byKey.get(k) ?? []), h]);
      }
      const updates: Array<{ id: string; hx: number; ax: number }> = [];
      for (const m of done) {
        const d = new Date(m.datetime.slice(0, 10));
        const cands = [0, -1, 1].flatMap((off) => byKey.get(`${new Date(d.getTime() + off * 86400e3).toISOString().slice(0, 10)}|${m.goals.h}-${m.goals.a}`) ?? []);
        const hid = resolve(m.h.title);
        const pick = cands.length === 1 && (!hid || !cands[0]!.home_team_id || cands[0]!.home_team_id === hid)
          ? cands[0] : hid ? cands.find((c) => c.home_team_id === hid) : undefined;
        if (!pick) { skipped++; continue; }
        if (pick.home_xg !== null) continue;
        updates.push({ id: pick.id, hx: Number(m.xG.h), ax: Number(m.xG.a) });
      }
      for (const u of updates) {
        const { error } = await sb.from("historical_results").update({ home_xg: Number(u.hx.toFixed(3)), away_xg: Number(u.ax.toFixed(3)) }).eq("id", u.id);
        if (!error) matched++;
      }
    }
  }
  return { matched, skipped, errors: errors.slice(0, 10), partial: false };
}
