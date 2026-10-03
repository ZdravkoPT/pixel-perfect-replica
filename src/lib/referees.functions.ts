import { createServerFn } from "@tanstack/react-start";
import { publicClient } from "./leagues.functions";

type TeamRef = { id: string; name: string; crest_url: string | null } | null;

/** Referees with at least one stored match, most active first. */
export const listReferees = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const [{ data: refs }, { data: offs }] = await Promise.all([
    sb.from("referees").select("id, name, country").limit(1000),
    sb.from("match_officials").select("referee_id").eq("role", "referee").limit(5000),
  ]);
  const count = new Map<string, number>();
  for (const o of offs ?? []) count.set(o.referee_id, (count.get(o.referee_id) ?? 0) + 1);
  return (refs ?? []).map((r) => ({ ...r, matches: count.get(r.id) ?? 0 }))
    .filter((r) => r.matches > 0).sort((a, b) => b.matches - a.matches);
});

export type RefMatch = {
  id: string | null; date: string; league: string | null; home: string; away: string;
  homeId: string | null; awayId: string | null; hg: number | null; ag: number | null;
  yellow: number | null; red: number | null; fouls: number | null; source: "app" | "archive";
};

/** Referee profile: every stored game plus averages from observed card/foul counts only. */
export const getReferee = createServerFn({ method: "GET" })
  .inputValidator((d: { refereeId: string }) => d)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: ref } = await sb.from("referees").select("id, name, country").eq("id", data.refereeId).maybeSingle();
    if (!ref) return { referee: null, matches: [] as RefMatch[], summary: null };
    const { data: offs } = await sb.from("match_officials").select("match_id").eq("referee_id", ref.id).eq("role", "referee");
    const ids = (offs ?? []).map((o) => o.match_id);
    const out: RefMatch[] = [];
    if (ids.length) {
      const [{ data: ms }, { data: st }] = await Promise.all([
        sb.from("matches").select("id, kickoff_at, status, home_score, away_score, home_team_id, away_team_id, league:leagues(name), home:teams!matches_home_team_id_fkey(id, name, crest_url), away:teams!matches_away_team_id_fkey(id, name, crest_url)").in("id", ids),
        sb.from("team_match_stats").select("match_id, yellow_cards, red_cards, fouls").in("match_id", ids),
      ]);
      const agg = new Map<string, { y: number | null; r: number | null; f: number | null }>();
      const add = (a: number | null, b: number | null) => (b == null ? a : (a ?? 0) + b);
      for (const s of st ?? []) {
        const a = agg.get(s.match_id) ?? { y: null, r: null, f: null };
        agg.set(s.match_id, { y: add(a.y, s.yellow_cards), r: add(a.r, s.red_cards), f: add(a.f, s.fouls) });
      }
      for (const m of ms ?? []) {
        const h = m.home as TeamRef, a = m.away as TeamRef, s = agg.get(m.id);
        out.push({
          id: m.id, date: m.kickoff_at, league: (m.league as { name: string } | null)?.name ?? null,
          home: h?.name ?? "?", away: a?.name ?? "?", homeId: m.home_team_id, awayId: m.away_team_id,
          hg: m.status === "FINISHED" ? m.home_score : null, ag: m.status === "FINISHED" ? m.away_score : null,
          yellow: s?.y ?? null, red: s?.r ?? null, fouls: s?.f ?? null, source: "app",
        });
      }
    }
    // Archive (football-data.co.uk) stores referees as "M Oliver".
    const parts = ref.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      const short = `${parts[0]![0]} ${parts.slice(1).join(" ")}`;
      const { data: hist } = await sb.from("historical_results")
        .select("match_date, league_code, home_name, away_name, home_team_id, away_team_id, home_goals, away_goals, home_yellow, away_yellow, home_red, away_red")
        .ilike("referee", short).order("match_date", { ascending: false }).limit(400);
      const seen = new Set(out.map((m) => `${m.date.slice(0, 10)}|${m.homeId}`));
      for (const r of hist ?? []) {
        if (seen.has(`${r.match_date}|${r.home_team_id}`)) continue;
        const y = r.home_yellow != null && r.away_yellow != null ? r.home_yellow + r.away_yellow : null;
        const rd = r.home_red != null && r.away_red != null ? r.home_red + r.away_red : null;
        out.push({
          id: null, date: r.match_date, league: r.league_code, home: r.home_name, away: r.away_name,
          homeId: r.home_team_id, awayId: r.away_team_id, hg: r.home_goals, ag: r.away_goals,
          yellow: y, red: rd, fouls: null, source: "archive",
        });
      }
    }
    out.sort((a, b) => b.date.localeCompare(a.date));
    const avg = (k: "yellow" | "red" | "fouls") => {
      const v = out.map((m) => m[k]).filter((x): x is number => x != null);
      return v.length ? { value: v.reduce((a, b) => a + b, 0) / v.length, n: v.length } : null;
    };
    const decided = out.filter((m) => m.hg != null && m.ag != null);
    const summary = {
      yellow: avg("yellow"), red: avg("red"), fouls: avg("fouls"),
      homeWinShare: decided.length ? decided.filter((m) => m.hg! > m.ag!).length / decided.length : null,
      goals: decided.length ? decided.reduce((a, m) => a + m.hg! + m.ag!, 0) / decided.length : null,
      decided: decided.length,
    };
    return { referee: ref, matches: out, summary };
  });

export type H2hGame = { date: string; league: string | null; homeId: string | null; hg: number; ag: number; home: string; away: string; matchId: string | null };

/** Every stored meeting between two teams (app matches + archive), newest first. */
export const getHeadToHead = createServerFn({ method: "GET" })
  .inputValidator((d: { teamA: string; teamB: string }) => d)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { teamA: a, teamB: b } = data;
    const pair = `and(home_team_id.eq.${a},away_team_id.eq.${b}),and(home_team_id.eq.${b},away_team_id.eq.${a})`;
    const [{ data: teams }, { data: ms }, { data: hist }] = await Promise.all([
      sb.from("teams").select("id, name, crest_url").in("id", [a, b]),
      sb.from("matches").select("id, kickoff_at, home_team_id, home_score, away_score, status, league:leagues(name)").or(pair).eq("status", "FINISHED"),
      sb.from("historical_results").select("match_date, league_code, home_team_id, home_name, away_name, home_goals, away_goals").or(pair).limit(500),
    ]);
    const name = (id: string | null) => teams?.find((t) => t.id === id)?.name ?? "?";
    const games: H2hGame[] = [];
    const seen = new Set<string>();
    for (const m of ms ?? []) {
      if (m.home_score == null || m.away_score == null) continue;
      const k = `${m.kickoff_at.slice(0, 10)}|${m.home_team_id}`; seen.add(k);
      const away = m.home_team_id === a ? b : a;
      games.push({ date: m.kickoff_at, league: (m.league as { name: string } | null)?.name ?? null, homeId: m.home_team_id, hg: m.home_score, ag: m.away_score, home: name(m.home_team_id), away: name(away), matchId: m.id });
    }
    for (const r of hist ?? []) {
      const k = `${r.match_date}|${r.home_team_id}`;
      if (seen.has(k)) continue; seen.add(k);
      games.push({ date: r.match_date, league: r.league_code, homeId: r.home_team_id, hg: r.home_goals, ag: r.away_goals, home: r.home_name, away: r.away_name, matchId: null });
    }
    games.sort((x, y) => y.date.localeCompare(x.date));
    const gfOf = (g: H2hGame, t: string) => (g.homeId === t ? g.hg : g.ag);
    const gaOf = (g: H2hGame, t: string) => (g.homeId === t ? g.ag : g.hg);
    const n = games.length;
    const summary = n ? {
      aWins: games.filter((g) => gfOf(g, a) > gaOf(g, a)).length,
      draws: games.filter((g) => g.hg === g.ag).length,
      bWins: games.filter((g) => gfOf(g, b) > gaOf(g, b)).length,
      aGoals: games.reduce((s, g) => s + gfOf(g, a), 0), bGoals: games.reduce((s, g) => s + gfOf(g, b), 0),
      over25: games.filter((g) => g.hg + g.ag > 2.5).length / n,
      btts: games.filter((g) => g.hg > 0 && g.ag > 0).length / n,
    } : null;
    return { teamA: teams?.find((t) => t.id === a) ?? null, teamB: teams?.find((t) => t.id === b) ?? null, games, summary };
  });
