import { createServerFn } from "@tanstack/react-start";

/**
 * Pre-match picture behind every pick the AI logged for one fixture: league
 * table, Elo and form strictly before kickoff, plus contradiction flags. Every
 * number is read from what was already stored — nothing is estimated.
 */

export type PickReviewPick = {
  betDate: string;
  slipType: string;
  market: string;
  pickCode: string;
  selection: string;
  probability: number;
  result: string | null;
  backsHome: boolean | null;
  flags: string[];
};

export type PickReview = {
  finished: boolean;
  picks: PickReviewPick[];
  snapshot: {
    homeTable: { pos: number; pts: number; played: number } | null;
    awayTable: { pos: number; pts: number; played: number } | null;
    homeElo: number | null;
    awayElo: number | null;
    homeForm: string | null;
    awayForm: string | null;
  };
  note: string | null;
};

type TeamRow = { id: string; name: string | null };

export const getPickReview = createServerFn({ method: "GET" })
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }): Promise<PickReview> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emptySnapshot = { homeTable: null, awayTable: null, homeElo: null, awayElo: null, homeForm: null, awayForm: null };
    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("kickoff_at, status, season_id, home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(id, name), away:teams!matches_away_team_id_fkey(id, name)")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) return { finished: false, picks: [], snapshot: emptySnapshot, note: null };
    const m = match as unknown as {
      kickoff_at: string; status: string; season_id: string | null;
      home_team_id: string; away_team_id: string;
      home: TeamRow | null; away: TeamRow | null;
    };
    const kickoff = new Date(m.kickoff_at);
    const finished = m.status === "FINISHED";

    const { data: bets } = await supabaseAdmin
      .from("ai_bet_log")
      .select("bet_date, slip_type, market, pick_code, selection, probability, result")
      .eq("match_id", data.matchId)
      .order("created_at", { ascending: true });
    const picks: PickReviewPick[] = (bets ?? []).map((b) => ({
      betDate: b.bet_date,
      slipType: b.slip_type,
      market: b.market,
      pickCode: b.pick_code,
      selection: b.selection,
      probability: Number(b.probability),
      result: b.result,
      backsHome: ["home", "dc_home"].includes(b.pick_code) ? true : ["away", "dc_away"].includes(b.pick_code) ? false : null,
      flags: [],
    }));
    if (!picks.length) {
      return { finished, picks: [], snapshot: emptySnapshot, note: "The AI made no pick for this fixture — nothing to review." };
    }

    const snapshot: PickReview["snapshot"] = { ...emptySnapshot };

    // ---- league table built only from games finished BEFORE this kickoff ----
    if (m.season_id) {
      const { data: prior } = await supabaseAdmin
        .from("matches")
        .select("home_team_id, away_team_id, home_score, away_score")
        .eq("season_id", m.season_id).eq("status", "FINISHED")
        .not("home_score", "is", null).lt("kickoff_at", m.kickoff_at)
        .limit(10000);
      const agg = new Map<string, { pts: number; gd: number; played: number }>();
      for (const g of prior ?? []) {
        const add = (id: string, f: number, a: number) => {
          const e = agg.get(id) ?? { pts: 0, gd: 0, played: 0 };
          e.played++; e.gd += f - a; e.pts += f > a ? 3 : f === a ? 1 : 0;
          agg.set(id, e);
        };
        add(g.home_team_id, g.home_score, g.away_score);
        add(g.away_team_id, g.away_score, g.home_score);
      }
      if (agg.size >= 8) {
        const sorted = [...agg.entries()].sort((a, b) => b[1].pts - a[1].pts || b[1].gd - a[1].gd);
        const pos = new Map(sorted.map(([id, e], i) => [id, { pos: i + 1, ...e }]));
        const ht = pos.get(m.home_team_id);
        const at = pos.get(m.away_team_id);
        if (ht && ht.played >= 5) snapshot.homeTable = { pos: ht.pos, pts: ht.pts, played: ht.played };
        if (at && at.played >= 5) snapshot.awayTable = { pos: at.pos, pts: at.pts, played: at.played };
      }
      // ---- form (last five results strictly before kickoff) ----
      for (const [tid, key] of [[m.home_team_id, "homeForm"], [m.away_team_id, "awayForm"]] as const) {
        const { data: rows } = await supabaseAdmin
          .from("matches")
          .select("home_team_id, away_team_id, home_score, away_score")
          .or(`home_team_id.eq.${tid},away_team_id.eq.${tid}`)
          .eq("status", "FINISHED").not("home_score", "is", null)
          .lt("kickoff_at", m.kickoff_at)
          .order("kickoff_at", { ascending: false }).limit(5);
        if (rows && rows.length >= 3) {
          snapshot[key] = rows
            .map((g) => {
              const gf = g.home_team_id === tid ? g.home_score : g.away_score;
              const ga = g.home_team_id === tid ? g.away_score : g.home_score;
              return gf > ga ? "W" : gf === ga ? "D" : "L";
            })
            .reverse().join("");
        }
      }
    }

    // ---- Elo as it stood at (or before) kickoff; later ratings are ignored ----
    for (const [tid, key] of [[m.home_team_id, "homeElo"], [m.away_team_id, "awayElo"]] as const) {
      const { data: er } = await supabaseAdmin
        .from("elo_ratings")
        .select("rating, as_of")
        .eq("team_id", tid)
        .lte("as_of", kickoff.toISOString())
        .order("as_of", { ascending: false })
        .limit(1);
      if (er?.length) snapshot[key] = Number(er[0].rating);
    }

    // ---- contradiction flags per pick ----
    const { homeTable, awayTable, homeElo, awayElo } = snapshot;
    for (const p of picks) {
      if (p.backsHome === null) continue;
      const ownName = (p.backsHome ? m.home : m.away)?.name ?? "backed side";
      const oppName = (p.backsHome ? m.away : m.home)?.name ?? "opponent";
      if (homeTable && awayTable) {
        const own = p.backsHome ? homeTable : awayTable;
        const o = p.backsHome ? awayTable : homeTable;
        if (own.pos - o.pos >= 5 && o.pts / o.played - own.pts / own.played >= 0.4) {
          p.flags.push(`${ownName} sat ${own.pos - o.pos} places below ${oppName} in the table (${(own.pts / own.played).toFixed(2)} vs ${(o.pts / o.played).toFixed(2)} points per game) when this pick was made.`);
        }
      }
      const ownElo = p.backsHome ? homeElo : awayElo;
      const oppElo = p.backsHome ? awayElo : homeElo;
      if (ownElo !== null && oppElo !== null && oppElo - ownElo >= 40) {
        p.flags.push(`${ownName} was rated ${Math.round(oppElo - ownElo)} Elo points below ${oppName} at kickoff.`);
      }
    }

    return { finished, picks, snapshot, note: null };
  });
