/**
 * Live re-scoring.
 *
 * For every fixture that is on the pitch right now we pull the public FotMob
 * in-play feed (status, score, clock, red cards, substitutions), write the live
 * score back onto the fixture and re-run the model for the *remaining* minutes
 * using the pre-match goal rates. Each re-score is stored as a new immutable
 * prediction row, so the history of how the pick moved is preserved. Finished
 * fixtures grade the saved AI picks hit / miss straight away.
 */

import { inPlayMarkets } from "@/lib/models/inplay";

export interface LiveRefreshResult {
  status: "success";
  checked: number;
  updated: number;
  rescored: number;
  settled: number;
  durationMs: number;
  errors: string[];
}

export async function runInPlayRefresh(options: { limit?: number } = {}): Promise<LiveRefreshResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { FotmobProvider } = await import("@/lib/providers/fotmob.server");
  const { settlePendingPicks } = await import("@/lib/bet-log.server");

  const now = Date.now();
  const from = new Date(now - 3.5 * 3_600_000).toISOString();
  const to = new Date(now + 5 * 60_000).toISOString();

  const cols =
    "id, kickoff_at, status, home_score, away_score, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)";
  const { data: candidates } = await supabaseAdmin
    .from("matches")
    .select(cols)
    .gte("kickoff_at", from)
    .lte("kickoff_at", to)
    .neq("status", "FINISHED")
    .order("kickoff_at", { ascending: true })
    .limit(options.limit ?? 40);

  // Sweep: games that kicked off earlier but never got a final whistle (missed runs,
  // late provider updates). Least-recently-touched first so every stale game rotates.
  const { data: stale } = await supabaseAdmin
    .from("matches")
    .select(cols)
    .lt("kickoff_at", from)
    .gte("kickoff_at", new Date(now - 7 * 86_400_000).toISOString())
    .in("status", ["SCHEDULED", "TIMED", "LIVE", "IN_PLAY", "PAUSED"])
    .order("updated_at", { ascending: true })
    .limit(12);
  for (const row of stale ?? []) await supabaseAdmin.from("matches").update({ minute: null }).eq("id", row.id);

  const matches = [...(candidates ?? []), ...(stale ?? [])];
  if (matches.length === 0) {
    const { settled } = await settlePendingPicks();
    return {
      status: "success",
      checked: 0,
      updated: 0,
      rescored: 0,
      settled,
      durationMs: Date.now() - startedAt,
      errors,
    };
  }

  const fotmob = new FotmobProvider();
  const ids = matches.map((row) => row.id);
  const { data: sources } = await supabaseAdmin
    .from("match_sources")
    .select("match_id, provider_match_id")
    .eq("source_id", "fotmob")
    .in("match_id", ids);
  const providerByMatch = new Map((sources ?? []).map((row) => [row.match_id, row.provider_match_id]));

  const { data: predictionRows } = await supabaseAdmin
    .from("predictions")
    .select("match_id, model_version_id, lambda_home, lambda_away, prediction_timestamp")
    .in("match_id", ids)
    .order("prediction_timestamp", { ascending: false });
  const basePrediction = new Map<string, (typeof predictionRows extends null ? never : NonNullable<typeof predictionRows>[number])>();
  for (const row of predictionRows ?? []) {
    if (!basePrediction.has(row.match_id)) basePrediction.set(row.match_id, row);
  }

  let updated = 0;
  let rescored = 0;

  for (const match of matches) {
    const home = (match as unknown as { home: { name: string } | null }).home?.name ?? "";
    const away = (match as unknown as { away: { name: string } | null }).away?.name ?? "";

    let providerId = providerByMatch.get(match.id) ?? null;
    if (!providerId) {
      providerId = await fotmob.findMatchId(match.kickoff_at, home, away);
      if (providerId) {
        await supabaseAdmin
          .from("match_sources")
          .insert({ match_id: match.id, source_id: "fotmob", provider_match_id: providerId });
      }
    }
    if (!providerId) continue;

    const feed = await fotmob.getInPlay(providerId);
    if (!feed.ok) {
      errors.push(`${home} v ${away}: ${feed.error}`);
      continue;
    }
    const live = feed.data;

    const patch: {
      status?: string;
      home_score?: number;
      away_score?: number;
      minute?: number;
    } = {};
    if (live.status !== match.status) patch.status = live.status;
    if (live.homeScore !== null && live.homeScore !== match.home_score) patch.home_score = live.homeScore;
    if (live.awayScore !== null && live.awayScore !== match.away_score) patch.away_score = live.awayScore;
    if (live.minute !== null) patch.minute = live.minute;
    if (Object.keys(patch).length > 0) {
      await supabaseAdmin.from("matches").update(patch).eq("id", match.id);
      updated += 1;
    }

    if (live.status !== "LIVE") continue;

    const base = basePrediction.get(match.id);
    if (!base) continue;

    const markets = inPlayMarkets(Number(base.lambda_home), Number(base.lambda_away), {
      minute: live.minute ?? 0,
      homeScore: live.homeScore ?? 0,
      awayScore: live.awayScore ?? 0,
      homeRed: live.homeRed,
      awayRed: live.awayRed,
    });

    const { data: inserted } = await supabaseAdmin
      .from("predictions")
      .insert({
        match_id: match.id,
        model_version_id: base.model_version_id,
        prediction_timestamp: new Date().toISOString(),
        p_home: markets.home,
        p_draw: markets.draw,
        p_away: markets.away,
        lambda_home: markets.remainingHome,
        lambda_away: markets.remainingAway,
        expected_goals:
          (live.homeScore ?? 0) + (live.awayScore ?? 0) + markets.remainingHome + markets.remainingAway,
        p_over_25: markets.over25,
        p_under_25: markets.under25,
        p_btts: markets.btts,
        confidence: Math.max(markets.home, markets.draw, markets.away),
        top_scoreline: `${markets.topScoreline.home}-${markets.topScoreline.away}`,
      })
      .select("id")
      .single();
    if (inserted) rescored += 1;
  }

  const { settled } = await settlePendingPicks();

  return {
    status: "success",
    checked: matches.length,
    updated,
    rescored,
    settled,
    durationMs: Date.now() - startedAt,
    errors: errors.slice(0, 10),
  };
}
