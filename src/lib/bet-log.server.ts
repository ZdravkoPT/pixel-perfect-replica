/**
 * Daily AI bet log: every pick the bet builder makes for today is stored once,
 * then graded hit / miss automatically as soon as the fixture finishes.
 */

export type LoggedPick = {
  matchId: string;
  fixture: string;
  league: string | null;
  kickoffAt: string;
  slipType: "mega" | "builder" | "single" | "match_pick";
  market: string;
  pickCode: string;
  selection: string;
  probability: number;
  fairOdds: number;
  facts?: string[];
  opinion?: string | null;
};

/** Decides whether a stored pick landed, given the final score. */
export function gradePick(pickCode: string, home: number, away: number): "hit" | "miss" {
  const total = home + away;
  const win = (value: boolean) => (value ? "hit" : "miss");
  const overLine = /^over(\d+)$/.exec(pickCode);
  const underLine = /^under(\d+)$/.exec(pickCode);
  if (overLine) return win(total > Number(overLine[1]) / 10);
  if (underLine) return win(total < Number(underLine[1]) / 10);
  switch (pickCode) {
    case "home":
      return win(home > away);
    case "draw":
      return win(home === away);
    case "away":
      return win(away > home);
    case "dc_home":
      return win(home >= away);
    case "dc_away":
      return win(away >= home);
    case "dc_nodraw":
      return win(home !== away);
    case "btts":
      return win(home > 0 && away > 0);
    case "home_scores":
      return win(home > 0);
    case "away_scores":
      return win(away > 0);
    case "btts_no":
      return win(home === 0 || away === 0);
    default:
      return "miss";
  }
}

/** Saves today's picks (idempotent — one row per fixture, slip and pick code). */
export async function logDailyPicks(picks: LoggedPick[]): Promise<number> {
  if (picks.length === 0) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const betDate = new Date().toISOString().slice(0, 10);
  const rows = picks.map((pick) => ({
    bet_date: betDate,
    match_id: pick.matchId,
    fixture: pick.fixture,
    league: pick.league,
    kickoff_at: pick.kickoffAt,
    slip_type: pick.slipType,
    market: pick.market,
    pick_code: pick.pickCode,
    selection: pick.selection,
    probability: pick.probability,
    fair_odds: pick.fairOdds,
    facts: pick.facts ?? null,
    opinion: pick.opinion ?? null,
  }));
  const { error } = await supabaseAdmin
    .from("ai_bet_log")
    .upsert(rows, { onConflict: "bet_date,match_id,slip_type,pick_code", ignoreDuplicates: true });
  return error ? 0 : rows.length;
}

/** Grades every pending pick whose fixture has a final score. */
export async function settlePendingPicks(): Promise<{ settled: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: pending } = await supabaseAdmin
    .from("ai_bet_log")
    .select("id, match_id, pick_code")
    .eq("result", "pending")
    .limit(2000);
  if (!pending || pending.length === 0) return { settled: 0 };

  const matchIds = Array.from(new Set(pending.map((row) => row.match_id)));
  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("id, status, home_score, away_score")
    .in("id", matchIds);
  const byId = new Map((matches ?? []).map((row) => [row.id, row]));

  let settled = 0;
  for (const row of pending) {
    const match = byId.get(row.match_id);
    if (!match) continue;
    if (match.status === "CANCELLED" || match.status === "POSTPONED") {
      await supabaseAdmin
        .from("ai_bet_log")
        .update({ result: "void", settled_at: new Date().toISOString() })
        .eq("id", row.id);
      settled += 1;
      continue;
    }
    if (match.status !== "FINISHED") continue;
    if (match.home_score === null || match.away_score === null) continue;
    let extra: { total_corners?: number; total_cards?: number } = {};
    let result: "hit" | "miss" | "void";
    const sp = /^(corners|cards)_(over|under)(\d+)$/.exec(row.pick_code);
    if (sp) {
      const { data: stats } = await supabaseAdmin
        .from("team_match_stats")
        .select("corners, yellow_cards, red_cards")
        .eq("match_id", row.match_id);
      const complete = (stats ?? []).length === 2 &&
        (stats ?? []).every((s) => (sp[1] === "corners" ? s.corners !== null : s.yellow_cards !== null));
      if (!complete) {
        // Box score not imported yet; give up after 4 days and void the pick.
        const { data: m } = await supabaseAdmin.from("matches").select("kickoff_at").eq("id", row.match_id).maybeSingle();
        if (!m || Date.now() - new Date(m.kickoff_at).getTime() < 4 * 86400e3) continue;
        result = "void";
      } else {
        const total = (stats ?? []).reduce(
          (a, s) => a + (sp[1] === "corners" ? Number(s.corners) : Number(s.yellow_cards) + Number(s.red_cards ?? 0)),
          0,
        );
        extra = sp[1] === "corners" ? { total_corners: total } : { total_cards: total };
        const line = Number(sp[3]) / 10;
        result = (sp[2] === "over" ? total > line : total < line) ? "hit" : "miss";
      }
    } else {
      result = gradePick(row.pick_code, Number(match.home_score), Number(match.away_score));
    }
    await supabaseAdmin
      .from("ai_bet_log")
      .update({
        result,
        ...extra,
        home_score: match.home_score,
        away_score: match.away_score,
        settled_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    settled += 1;
  }
  return { settled };
}
