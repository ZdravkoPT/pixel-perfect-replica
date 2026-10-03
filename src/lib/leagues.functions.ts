import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const getLeagues = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data } = await supabase
    .from("leagues")
    .select("id, name, country, logo_url, is_featured, tier")
    .order("is_featured", { ascending: false })
    .order("name");
  return data ?? [];
});

export type TableRow = {
  teamId: string; name: string; crest: string | null;
  p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; form: string[];
};
export type Leader = { playerId: string; name: string; team: string | null; value: number; games: number };
export type TotwPlayer = { playerId: string; name: string; team: string | null; position: string | null; rating: number };

export const getLeagueDetail = createServerFn({ method: "GET" })
  .inputValidator((input: { leagueId: string }) => input)
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: league } = await supabase
      .from("leagues").select("id, name, country, logo_url").eq("id", data.leagueId).maybeSingle();
    if (!league) return { league: null };

    const { data: season } = await supabase
      .from("seasons").select("id, year_label").eq("league_id", league.id).eq("is_current", true).maybeSingle();

    let mq = supabase
      .from("matches")
      .select("id, kickoff_at, home_team_id, away_team_id, home_score, away_score, stage, home:teams!matches_home_team_id_fkey(name, crest_url), away:teams!matches_away_team_id_fkey(name, crest_url)")
      .eq("league_id", league.id).eq("status", "FINISHED").not("home_score", "is", null)
      .order("kickoff_at", { ascending: true }).limit(1000);
    if (season) mq = mq.eq("season_id", season.id);
    else mq = mq.gte("kickoff_at", new Date(Date.now() - 300 * 86400_000).toISOString());
    const { data: matches } = await mq;
    const ms = matches ?? [];

    // League table from our own finished results (regular-season style stages only)
    const table = new Map<string, TableRow>();
    const row = (id: string, t: { name: string; crest_url: string | null } | null) => {
      let r = table.get(id);
      if (!r) { r = { teamId: id, name: t?.name ?? "?", crest: t?.crest_url ?? null, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }; table.set(id, r); }
      return r;
    };
    for (const m of ms) {
      if (m.stage && !/REGULAR|LEAGUE/i.test(m.stage)) continue;
      const h = row(m.home_team_id, m.home as never), a = row(m.away_team_id, m.away as never);
      const hs = m.home_score!, as = m.away_score!;
      h.p++; a.p++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
      if (hs > as) { h.w++; a.l++; h.pts += 3; h.form.push("W"); a.form.push("L"); }
      else if (hs < as) { a.w++; h.l++; a.pts += 3; a.form.push("W"); h.form.push("L"); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push("D"); a.form.push("D"); }
    }
    const standings = [...table.values()]
      .map((r) => ({ ...r, form: r.form.slice(-5) }))
      .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name));

    // Player leaders + team of the week from stored per-player match stats
    const ids = ms.map((m) => m.id);
    type Stat = { match_id: string; player_id: string; goals: number; assists: number; yellow_cards: number; red_cards: number; rating: number | null; minutes: number; player: { name: string; position: string | null } | null; team: { name: string } | null };
    const stats: Stat[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data: s } = await supabase
        .from("player_match_stats")
        .select("match_id, player_id, goals, assists, yellow_cards, red_cards, rating, minutes, player:players(name, position), team:teams(name)")
        .in("match_id", ids.slice(i, i + 100));
      stats.push(...((s ?? []) as unknown as Stat[]));
    }
    const agg = new Map<string, { name: string; team: string | null; goals: number; assists: number; cards: number; games: number }>();
    for (const s of stats) {
      let a = agg.get(s.player_id);
      if (!a) { a = { name: s.player?.name ?? "?", team: s.team?.name ?? null, goals: 0, assists: 0, cards: 0, games: 0 }; agg.set(s.player_id, a); }
      a.goals += s.goals; a.assists += s.assists; a.cards += s.yellow_cards + s.red_cards * 2; if (s.minutes > 0) a.games++;
    }
    const top = (k: "goals" | "assists" | "cards"): Leader[] =>
      [...agg.entries()].filter(([, a]) => a[k] > 0)
        .sort((x, y) => y[1][k] - x[1][k] || x[1].games - y[1].games).slice(0, 10)
        .map(([playerId, a]) => ({ playerId, name: a.name, team: a.team, value: a[k], games: a.games }));

    // Team of the week: best rated player per line from the latest 7-day window with ratings
    const kick = new Map(ms.map((m) => [m.id, new Date(m.kickoff_at).getTime()]));
    const rated = stats.filter((s) => s.rating != null && s.minutes >= 45);
    let totw: TotwPlayer[] = [];
    let totwWeek: string | null = null;
    if (rated.length) {
      const last = Math.max(...rated.map((s) => kick.get(s.match_id) ?? 0));
      const recent = rated.filter((s) => (kick.get(s.match_id) ?? 0) > last - 7 * 86400_000);
      totwWeek = new Date(last).toISOString();
      const line = (p: string | null) => {
        const x = (p ?? "").toUpperCase();
        if (/G/.test(x[0] ?? "") || x.includes("GOAL")) return "GK";
        if (x.startsWith("D") || x.includes("BACK")) return "DEF";
        if (x.startsWith("M") || x.includes("MID")) return "MID";
        if (x) return "FWD";
        return null;
      };
      const quota: Record<string, number> = { GK: 1, DEF: 4, MID: 3, FWD: 3 };
      const used = new Set<string>();
      for (const pos of ["GK", "DEF", "MID", "FWD"]) {
        const pool = recent.filter((s) => line(s.player?.position ?? null) === pos && !used.has(s.player_id))
          .sort((a, b) => Number(b.rating) - Number(a.rating));
        for (const s of pool.slice(0, quota[pos])) {
          used.add(s.player_id);
          totw.push({ playerId: s.player_id, name: s.player?.name ?? "?", team: s.team?.name ?? null, position: pos, rating: Number(s.rating) });
        }
      }
      if (totw.length < 11) totw = totw; // never pad with invented players
    }

    return {
      league, season: season?.year_label ?? null, matches: ms.length, standings,
      scorers: top("goals"), assists: top("assists"), cards: top("cards"), totw, totwWeek, statMatches: new Set(stats.map((s) => s.match_id)).size,
    };
  });

export type Absence = { playerId: string; name: string; reason: string; expectedReturn: string | null; kind: "injury" | "suspension" };

export const getTeamAbsences = createServerFn({ method: "GET" })
  .inputValidator((input: { teamId: string }) => input)
  .handler(async ({ data }): Promise<Absence[]> => {
    const supabase = publicClient();
    const [{ data: inj }, { data: last }] = await Promise.all([
      supabase.from("injuries").select("player_id, reason, expected_return, player:players(name)")
        .eq("team_id", data.teamId).is("resolved_at", null).order("expected_return", { ascending: true, nullsFirst: false }),
      supabase.from("matches").select("id").or(`home_team_id.eq.${data.teamId},away_team_id.eq.${data.teamId}`)
        .eq("status", "FINISHED").order("kickoff_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const out: Absence[] = (inj ?? []).map((r) => ({
      playerId: r.player_id, name: (r.player as { name: string } | null)?.name ?? "?",
      reason: r.reason ?? "Injured", expectedReturn: r.expected_return, kind: "injury",
    }));
    if (last) {
      const { data: reds } = await supabase.from("player_match_stats").select("player_id, player:players(name)")
        .eq("match_id", last.id).eq("team_id", data.teamId).gt("red_cards", 0);
      for (const r of reds ?? []) out.push({ playerId: r.player_id, name: (r.player as { name: string } | null)?.name ?? "?", reason: "Red card in last match — likely suspended", expectedReturn: null, kind: "suspension" });
    }
    return out;
  });

export const searchAll = createServerFn({ method: "GET" })
  .inputValidator((input: { q: string }) => ({ q: String(input.q ?? "").trim().slice(0, 60) }))
  .handler(async ({ data }) => {
    if (data.q.length < 2) return { teams: [], players: [], coaches: [], leagues: [] };
    const supabase = publicClient();
    const like = `%${data.q.replace(/[%_,()]/g, " ")}%`;
    const [t, p, c, l] = await Promise.all([
      supabase.from("teams").select("id, name, country, crest_url").ilike("name", like).limit(12),
      supabase.from("players").select("id, name, position, nationality, photo_url").ilike("name", like).limit(20),
      supabase.from("coaches").select("id, name, nationality").ilike("name", like).limit(8),
      supabase.from("leagues").select("id, name, country, logo_url").ilike("name", like).limit(8),
    ]);
    return { teams: t.data ?? [], players: p.data ?? [], coaches: c.data ?? [], leagues: l.data ?? [] };
  });
