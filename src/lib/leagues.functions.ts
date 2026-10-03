import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function publicClient() {
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
      .from("seasons").select("id, year_label").eq("league_id", league.id).eq("is_current", true).order("year_label", { ascending: false }).limit(1).maybeSingle();

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

    const shotAgg = new Map<string, { name: string; xg: number; goals: number; shots: number }>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data: sh } = await supabase.from("match_shots").select("player_id, player_name, model_xg, is_goal")
        .in("match_id", ids.slice(i, i + 100)).not("player_id", "is", null).not("model_xg", "is", null);
      for (const r of sh ?? []) {
        const a = shotAgg.get(r.player_id!) ?? { name: r.player_name ?? "?", xg: 0, goals: 0, shots: 0 };
        a.xg += Number(r.model_xg); a.goals += r.is_goal ? 1 : 0; a.shots++; shotAgg.set(r.player_id!, a);
      }
    }
    const xgLeaders = [...shotAgg.entries()].sort((a, b) => b[1].xg - a[1].xg).slice(0, 10)
      .map(([playerId, a]) => ({ playerId, name: a.name, xg: Math.round(a.xg * 10) / 10, goals: a.goals, shots: a.shots }));

    return {
      xgLeaders,
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

export type SimRow = { teamId: string; name: string; pts: number; expPts: number; title: number; top4: number; relegation: number };

/** Monte Carlo of the rest of a double round-robin season from current attack/defence strengths. */
export const simulateSeason = createServerFn({ method: "GET" })
  .inputValidator((input: { leagueId: string }) => input)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: season } = await sb.from("seasons").select("id").eq("league_id", data.leagueId).eq("is_current", true).order("year_label", { ascending: false }).limit(1).maybeSingle();
    let q = sb.from("matches")
      .select("home_team_id, away_team_id, home_score, away_score, stage, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)")
      .eq("league_id", data.leagueId).eq("status", "FINISHED").not("home_score", "is", null).limit(1000);
    q = season ? q.eq("season_id", season.id) : q.gte("kickoff_at", new Date(Date.now() - 300 * 86400_000).toISOString());
    const { data: ms } = await q;
    let games = (ms ?? []).filter((m) => !m.stage || /REGULAR|LEAGUE/i.test(m.stage));
    // drop clubs with very few games (left over from another season / promotion mix-ups)
    const cnt = new Map<string, number>();
    for (const g of games) for (const t of [g.home_team_id, g.away_team_id]) cnt.set(t, (cnt.get(t) ?? 0) + 1);
    const med = [...cnt.values()].sort((a, b) => a - b)[Math.floor(cnt.size / 2)] ?? 0;
    games = games.filter((g) => (cnt.get(g.home_team_id) ?? 0) >= med / 2 && (cnt.get(g.away_team_id) ?? 0) >= med / 2);
    const T = new Map<string, { name: string; pts: number; gf: number; ga: number; hgf: number; hga: number; agf: number; aga: number; hp: number; ap: number }>();
    const get = (id: string, n: string | undefined) => {
      let t = T.get(id); if (!t) { t = { name: n ?? "?", pts: 0, gf: 0, ga: 0, hgf: 0, hga: 0, agf: 0, aga: 0, hp: 0, ap: 0 }; T.set(id, t); } return t;
    };
    const played = new Set<string>();
    let hg = 0, ag = 0;
    for (const m of games) {
      const h = get(m.home_team_id, (m.home as { name: string } | null)?.name), a = get(m.away_team_id, (m.away as { name: string } | null)?.name);
      const x = m.home_score!, y = m.away_score!;
      h.gf += x; h.ga += y; a.gf += y; a.ga += x; h.hp++; a.ap++;
      h.pts += x > y ? 3 : x === y ? 1 : 0; a.pts += y > x ? 3 : x === y ? 1 : 0;
      played.add(`${m.home_team_id}|${m.away_team_id}`); hg += x; ag += y;
    }
    const n = T.size;
    if (n < 8 || games.length < 1.5 * n) return { rows: [] as SimRow[], remaining: 0, runs: 0 };
    const lh = hg / games.length, la = ag / games.length, avg = (lh + la) / 2;
    const K = 6; // shrink strengths toward average until a team has ~6 games
    const str = new Map([...T].map(([id, t]) => {
      const p = t.hp + t.ap;
      return [id, { att: (t.gf + K * avg) / (p + K) / avg, def: (t.ga + K * avg) / (p + K) / avg }];
    }));
    const ids = [...T.keys()];
    const fixtures: [string, string, number, number][] = [];
    for (const h of ids) for (const a of ids) {
      if (h === a || played.has(`${h}|${a}`)) continue;
      const sh = str.get(h)!, sa = str.get(a)!;
      fixtures.push([h, a, Math.min(4.5, lh * sh.att * sa.def), Math.min(4.5, la * sa.att * sh.def)]);
    }
    const poi = (l: number) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; };
    const RUNS = 10000;
    const idx = new Map(ids.map((id, i) => [id, i]));
    const base: number[] = ids.map((id) => T.get(id)!.pts);
    const gd0: number[] = ids.map((id) => T.get(id)!.gf - T.get(id)!.ga);
    const title = new Array(n).fill(0), top4 = new Array(n).fill(0), rel = new Array(n).fill(0), exp = new Array(n).fill(0);
    const pts = new Array(n).fill(0), gd = new Array(n).fill(0), order = ids.map((_, i) => i);
    for (let r = 0; r < RUNS; r++) {
      for (let i = 0; i < n; i++) { pts[i] = base[i]; gd[i] = gd0[i]; }
      for (const [h, a, l1, l2] of fixtures) {
        const x = poi(l1), y = poi(l2), hi = idx.get(h)!, ai = idx.get(a)!;
        if (x > y) pts[hi] += 3; else if (x < y) pts[ai] += 3; else { pts[hi]++; pts[ai]++; }
        gd[hi] += x - y; gd[ai] += y - x;
      }
      order.sort((p, q) => pts[q] - pts[p] || gd[q] - gd[p] || Math.random() - 0.5);
      order.forEach((ti, pos) => { if (pos === 0) title[ti]++; if (pos < 4) top4[ti]++; if (pos >= n - 3) rel[ti]++; exp[ti] += pts[ti]; });
    }
    const rows: SimRow[] = ids.map((id, i) => ({
      teamId: id, name: T.get(id)!.name, pts: base[i]!, expPts: exp[i] / RUNS, title: title[i] / RUNS, top4: top4[i] / RUNS, relegation: rel[i] / RUNS,
    })).sort((a, b) => b.expPts - a.expPts);
    return { rows, remaining: fixtures.length, runs: RUNS };
  });
