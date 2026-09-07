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
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

type MatchRow = {
  id: string;
  kickoff_at: string;
  home_team_id: string;
  away_team_id: string;
  league: { name: string } | null;
  home: { id: string; name: string } | null;
  away: { id: string; name: string } | null;
};

function odds(p: number): number {
  return p > 0 ? 1 / p : 0;
}

/**
 * Value board: every upcoming fixture with its 1X2 fair odds, how those odds have
 * moved between the first and the latest immutable prediction, and the strongest
 * player-prop projections attached to that fixture.
 */
export const getValueBoard = createServerFn({ method: "GET" })
  .inputValidator((input: { hours?: number } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const hours = data.hours ?? 96;
    const now = new Date();
    const until = new Date(now.getTime() + hours * 3600_000);

    const { data: matches } = await supabase
      .from("matches")
      .select(
        "id, kickoff_at, home_team_id, away_team_id, league:leagues(name), home:teams!matches_home_team_id_fkey(id, name), away:teams!matches_away_team_id_fkey(id, name)",
      )
      .gte("kickoff_at", now.toISOString())
      .lte("kickoff_at", until.toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(60);

    const rows = (matches ?? []) as unknown as MatchRow[];
    if (rows.length === 0) return { matches: [], generatedAt: now.toISOString() };

    const ids = rows.map((row) => row.id);
    const [{ data: predictions }, { data: props }, { data: lineupRows }] = await Promise.all([
      supabase
        .from("predictions")
        .select("match_id, prediction_timestamp, p_home, p_draw, p_away, p_over_25, p_btts, confidence")
        .in("match_id", ids)
        .order("prediction_timestamp", { ascending: true }),
      supabase
        .from("player_prop_predictions")
        .select(
          "match_id, market, selection, probability, fair_odds, expected_minutes, team_id, prediction_timestamp, player:players(id, name, position)",
        )
        .in("match_id", ids)
        .gte("probability", 0.18)
        .order("probability", { ascending: false })
        .limit(1200),
      supabase
        .from("lineups")
        .select(
          "match_id, team_id, is_predicted, confidence, updated_at, players:lineup_players(player_id, is_starter, expected_minutes, start_probability)",
        )
        .in("match_id", ids),
    ]);

    type LineupInfo = {
      confirmed: boolean;
      updatedAt: string | null;
      players: Map<
        string,
        { isStarter: boolean; expectedMinutes: number | null; startProbability: number | null }
      >;
    };

    const lineupByMatch = new Map<string, LineupInfo>();
    for (const lineup of lineupRows ?? []) {
      const info =
        lineupByMatch.get(lineup.match_id) ??
        ({ confirmed: false, updatedAt: null, players: new Map() } as LineupInfo);
      if (!lineup.is_predicted) info.confirmed = true;
      if (lineup.updated_at && (!info.updatedAt || lineup.updated_at > info.updatedAt)) {
        info.updatedAt = lineup.updated_at;
      }
      for (const row of lineup.players ?? []) {
        info.players.set(row.player_id, {
          isStarter: row.is_starter,
          expectedMinutes: row.expected_minutes === null ? null : Number(row.expected_minutes),
          startProbability: row.start_probability === null ? null : Number(row.start_probability),
        });
      }
      lineupByMatch.set(lineup.match_id, info);
    }


    const byMatch = new Map<string, typeof predictions>();
    for (const row of predictions ?? []) {
      const list = byMatch.get(row.match_id) ?? [];
      list.push(row);
      byMatch.set(row.match_id, list);
    }

    const propsByMatch = new Map<string, NonNullable<typeof props>>();
    for (const row of props ?? []) {
      const list = propsByMatch.get(row.match_id) ?? [];
      list.push(row);
      propsByMatch.set(row.match_id, list);
    }

    const board = rows.map((match) => {
      const history = byMatch.get(match.id) ?? [];
      const first = history[0] ?? null;
      const latest = history[history.length - 1] ?? null;
      const selections =
        latest === null
          ? []
          : ([
              { key: "home", label: match.home?.name ?? "Home", p: Number(latest.p_home), p0: Number(first?.p_home ?? latest.p_home) },
              { key: "draw", label: "Draw", p: Number(latest.p_draw), p0: Number(first?.p_draw ?? latest.p_draw) },
              { key: "away", label: match.away?.name ?? "Away", p: Number(latest.p_away), p0: Number(first?.p_away ?? latest.p_away) },
              latest.p_over_25 !== null
                ? { key: "over25", label: "Over 2.5", p: Number(latest.p_over_25), p0: Number(first?.p_over_25 ?? latest.p_over_25) }
                : null,
              latest.p_btts !== null
                ? { key: "btts", label: "Both teams score", p: Number(latest.p_btts), p0: Number(first?.p_btts ?? latest.p_btts) }
                : null,
            ].filter(Boolean) as Array<{ key: string; label: string; p: number; p0: number }>);

      const lineup = lineupByMatch.get(match.id) ?? null;
      const lineupStatus = lineup === null ? "none" : lineup.confirmed ? "confirmed" : "projected";

      const propRows = (propsByMatch.get(match.id) ?? [])
        .slice()
        // Only price players who are actually on the latest team sheet, and prefer
        // starters — a projection for someone outside the XI is not real value.
        .filter((row) => {
          if (lineup === null || !row.player?.id) return lineup === null;
          const entry = lineup.players.get(row.player.id);
          return Boolean(entry?.isStarter);
        })
        .sort((a, b) => Number(b.probability) - Number(a.probability))
        .slice(0, 6)
        .map((row) => {
          const entry = row.player?.id ? (lineup?.players.get(row.player.id) ?? null) : null;
          return {
            player: row.player?.name ?? "Unknown",
            position: row.player?.position ?? null,
            team:
              row.team_id === match.home_team_id
                ? (match.home?.name ?? "Home")
                : (match.away?.name ?? "Away"),
            market: row.market,
            selection: row.selection,
            probability: Number(row.probability),
            fairOdds: Number(row.fair_odds),
            expectedMinutes:
              entry?.expectedMinutes ??
              (row.expected_minutes === null ? null : Number(row.expected_minutes)),
            startProbability: entry?.startProbability ?? null,
            lineupStatus,
          };
        });

      return {
        matchId: match.id,
        kickoffAt: match.kickoff_at,
        league: match.league?.name ?? "Unknown league",
        homeName: match.home?.name ?? "Home",
        awayName: match.away?.name ?? "Away",
        revisions: history.length,
        firstPricedAt: first?.prediction_timestamp ?? null,
        lastPricedAt: latest?.prediction_timestamp ?? null,
        confidence: latest?.confidence === null || latest === null ? null : Number(latest.confidence),
        lineupStatus,
        lineupUpdatedAt: lineup?.updatedAt ?? null,
        selections: selections.map((row) => ({
          key: row.key,
          label: row.label,
          probability: row.p,
          fairOdds: odds(row.p),
          openingFairOdds: odds(row.p0),
          drift: odds(row.p) - odds(row.p0),
        })),
        props: propRows,
      };
    });

    return { matches: board, generatedAt: now.toISOString() };
  });

/** Average age and nationality mix for the two squads in a fixture. */
export const getSquadProfile = createServerFn({ method: "GET" })
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: match } = await supabase
      .from("matches")
      .select(
        "home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)",
      )
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) return { teams: [] };

    const teamIds = [match.home_team_id, match.away_team_id];
    const { data: squad } = await supabase
      .from("squad_memberships")
      .select("team_id, player:players(id, birth_date, nationality, position)")
      .in("team_id", teamIds)
      .eq("is_current", true);

    const teams = teamIds.map((teamId, index) => {
      const rows = (squad ?? []).filter((row) => row.team_id === teamId);
      const ages = rows
        .map((row) => row.player?.birth_date)
        .filter((value): value is string => Boolean(value))
        .map((value) => (Date.now() - new Date(value).getTime()) / (365.25 * 24 * 3600_000));
      const nations = new Map<string, number>();
      for (const row of rows) {
        const nation = row.player?.nationality ?? "Unknown";
        nations.set(nation, (nations.get(nation) ?? 0) + 1);
      }
      return {
        teamId,
        name: index === 0 ? (match.home?.name ?? "Home") : (match.away?.name ?? "Away"),
        squadSize: rows.length,
        averageAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
        youngest: ages.length ? Math.min(...ages) : null,
        oldest: ages.length ? Math.max(...ages) : null,
        nations: [...nations.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([nation, count]) => ({ nation, count })),
        nationCount: nations.size,
      };
    });

    return { teams };
  });

type Candidate = {
  matchId: string;
  fixture: string;
  league: string;
  kickoffAt: string;
  market: string;
  selection: string;
  probability: number;
  adjustedProbability: number;
  fairOdds: number;
  confidence: number | null;
  kind: "match" | "player";
  lineupStatus: "confirmed" | "projected" | "none";
  score: number;
};

/** Latest completed 10-week review, used both for display and for calibration. */
async function loadCalibration(supabase: ReturnType<typeof publicClient>) {
  const { data } = await supabase
    .from("bet_history_runs")
    .select(
      "id, weeks, threshold, window_from, window_to, matches, picks, wins, hit_rate, expected_hit_rate, roi_fair, roi_market, log_loss, brier, by_market, weekly, calibration, finished_at",
    )
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { run: null, multipliers: new Map<string, number>() };

  const multipliers = new Map<string, number>();
  for (const row of (data.by_market ?? []) as Array<{ market: string; multiplier: number }>) {
    if (row?.market && Number.isFinite(row.multiplier)) multipliers.set(row.market, Number(row.multiplier));
  }
  return { run: data, multipliers };
}

/** Public read of the past-N-week bet-builder scorecard. */
export const getBetHistory = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { run } = await loadCalibration(supabase);
  if (!run) return { run: null, recent: [] };

  const { data: recent } = await supabase
    .from("bet_history_picks")
    .select("kickoff_at, fixture, market, selection, probability, fair_odds, won, result")
    .eq("run_id", run.id)
    .order("kickoff_at", { ascending: false })
    .limit(40);

  return { run, recent: recent ?? [] };
});

/**
 * Today's strongest model signals, calibrated against the last 10 weeks of
 * graded bets, plus a programmatically built accumulator and an AI brief.
 * Every number handed to the model comes from stored immutable predictions.
 */
export const getAiBets = createServerFn({ method: "GET" })
  .inputValidator((input: { minProbability?: number } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const min = data.minProbability ?? 0.55;
    const now = new Date();
    const end = new Date(now);
    end.setUTCHours(23, 59, 59, 999);

    const { run: historyRun, multipliers } = await loadCalibration(supabase);

    const { data: matches } = await supabase
      .from("matches")
      .select(
        "id, kickoff_at, home_team_id, league:leagues(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)",
      )
      .gte("kickoff_at", now.toISOString())
      .lte("kickoff_at", end.toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(40);

    const rows = (matches ?? []) as unknown as Array<MatchRow & { home_team_id: string }>;
    if (rows.length === 0) {
      return {
        candidates: [],
        builder: null,
        history: historyRun,
        brief: null,
        generatedAt: now.toISOString(),
        reason: "no-fixtures" as const,
      };
    }

    const ids = rows.map((row) => row.id);
    const [{ data: predictions }, { data: props }, { data: lineupRows }] = await Promise.all([
      supabase
        .from("predictions")
        .select(
          "match_id, prediction_timestamp, p_home, p_draw, p_away, p_over_25, p_under_25, p_btts, confidence, lambda_home, lambda_away, expected_goals, top_scoreline",
        )
        .in("match_id", ids)
        .order("prediction_timestamp", { ascending: false }),
      supabase
        .from("player_prop_predictions")
        .select("match_id, market, selection, probability, fair_odds, team_id, player:players(name)")
        .in("match_id", ids)
        .gte("probability", min)
        .order("probability", { ascending: false })
        .limit(60),
      supabase.from("lineups").select("match_id, is_predicted").in("match_id", ids),
    ]);


    const lineupStatusByMatch = new Map<string, "confirmed" | "projected">();
    for (const row of lineupRows ?? []) {
      if (!row.is_predicted) lineupStatusByMatch.set(row.match_id, "confirmed");
      else if (!lineupStatusByMatch.has(row.match_id)) lineupStatusByMatch.set(row.match_id, "projected");
    }

    const latest = new Map<string, NonNullable<typeof predictions>[number]>();
    for (const row of predictions ?? []) if (!latest.has(row.match_id)) latest.set(row.match_id, row);

    const adjust = (market: string, probability: number) =>
      Math.min(0.97, Math.max(0.02, probability * (multipliers.get(market) ?? 1)));

    const candidates: Candidate[] = [];
    for (const match of rows) {
      const prediction = latest.get(match.id);
      if (!prediction) continue;
      const fixture = `${match.home?.name ?? "Home"} vs ${match.away?.name ?? "Away"}`;
      const lineupStatus = lineupStatusByMatch.get(match.id) ?? "none";
      const confidence = prediction.confidence === null ? null : Number(prediction.confidence);
      const options: Array<[string, string, number | null]> = [
        ["home", `${match.home?.name ?? "Home"} to win`, Number(prediction.p_home)],
        ["draw", "Draw", Number(prediction.p_draw)],
        ["away", `${match.away?.name ?? "Away"} to win`, Number(prediction.p_away)],
        ["over25", "Over 2.5 goals", prediction.p_over_25 === null ? null : Number(prediction.p_over_25)],
        ["under25", "Under 2.5 goals", prediction.p_under_25 === null ? null : Number(prediction.p_under_25)],
        ["btts", "Both teams to score", prediction.p_btts === null ? null : Number(prediction.p_btts)],
      ];
      for (const [market, selection, probability] of options) {
        if (probability === null || probability < min) continue;
        const adjusted = adjust(market, probability);
        candidates.push({
          matchId: match.id,
          fixture,
          league: match.league?.name ?? "Unknown league",
          kickoffAt: match.kickoff_at,
          market,
          selection,
          probability,
          adjustedProbability: adjusted,
          fairOdds: odds(adjusted),
          confidence,
          kind: "match",
          lineupStatus,
          // Rank on the calibrated probability, nudged by model confidence and
          // by whether a real team sheet is already known.
          score:
            adjusted *
            (1 + 0.15 * (confidence ?? 0.5)) *
            (lineupStatus === "confirmed" ? 1.06 : lineupStatus === "projected" ? 1 : 0.98),
        });
      }
    }

    for (const row of props ?? []) {
      const match = rows.find((item) => item.id === row.match_id);
      if (!match) continue;
      const lineupStatus = lineupStatusByMatch.get(row.match_id) ?? "none";
      const probability = Number(row.probability);
      const adjusted = adjust(row.market, probability);
      candidates.push({
        matchId: row.match_id,
        fixture: `${match.home?.name ?? "Home"} vs ${match.away?.name ?? "Away"}`,
        league: match.league?.name ?? "Unknown league",
        kickoffAt: match.kickoff_at,
        market: row.market,
        selection: `${row.player?.name ?? "Player"} · ${row.selection.replace(/_/g, " ")}`,
        probability,
        adjustedProbability: adjusted,
        fairOdds: odds(adjusted),
        confidence: null,
        kind: "player",
        lineupStatus,
        // Player props without a confirmed sheet carry line-up risk on top of
        // model risk, so they are discounted relative to match markets.
        score: adjusted * (lineupStatus === "confirmed" ? 1 : 0.85),
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const shortlist = candidates.slice(0, 24);

    if (shortlist.length === 0) {
      return {
        candidates: [],
        builder: null,
        history: historyRun,
        brief: null,
        generatedAt: now.toISOString(),
        reason: "no-signals" as const,
      };
    }

    // Programmatic accumulator: strongest calibrated leg per fixture, at most
    // one leg per match so the legs stay statistically independent.
    const usedMatches = new Set<string>();
    const legs = shortlist
      .filter((row) => {
        if (usedMatches.has(row.matchId)) return false;
        usedMatches.add(row.matchId);
        return true;
      })
      .slice(0, 4);
    const combined = legs.reduce((acc, leg) => acc * leg.adjustedProbability, 1);
    const builder =
      legs.length >= 2
        ? {
            legs: legs.map((leg) => ({
              matchId: leg.matchId,
              fixture: leg.fixture,
              selection: leg.selection,
              probability: leg.adjustedProbability,
              fairOdds: leg.fairOdds,
            })),
            probability: combined,
            fairOdds: odds(combined),
          }
        : null;

    let brief: string | null = null;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (apiKey) {
      const historyLine = historyRun
        ? `Graded record over the last ${historyRun.weeks} weeks: ${historyRun.wins}/${historyRun.picks} bets won (${((Number(historyRun.hit_rate) || 0) * 100).toFixed(1)}% hit rate vs ${((Number(historyRun.expected_hit_rate) || 0) * 100).toFixed(1)}% expected, return per unit at a typical bookmaker price ${((Number(historyRun.roi_market) || 0) * 100).toFixed(1)}%). Per market: ${(
            (historyRun.by_market ?? []) as Array<{
              market: string;
              picks: number;
              hitRate: number;
              expectedHitRate: number;
              roiMarket: number;
            }>
          )
            .map(
              (row) =>
                `${row.market} ${row.picks} bets, ${(row.hitRate * 100).toFixed(0)}% actual vs ${(row.expectedHitRate * 100).toFixed(0)}% expected, ROI ${(row.roiMarket * 100).toFixed(0)}%`,
            )
            .join("; ")}.`
        : "No graded history is available yet.";

      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3.7-flash",
            messages: [
              {
                role: "system",
                content:
                  "You are a disciplined football betting analyst. Use ONLY the supplied model probabilities and the supplied graded track record. " +
                  "The probabilities are already calibrated against that record. No bookmaker prices are available, so never claim a price beats the market. " +
                  "Lean into markets whose historical actual hit rate beat expectation and stay away from markets that underperformed — say so explicitly. " +
                  "Answer in markdown with four short sections: 'Track record read' (2 bullets on what the past weeks say about which markets to trust), " +
                  "'Top singles' (max 4 bullets, each with the calibrated probability and fair odds), " +
                  "'Bet builder' (comment on the pre-built accumulator, state the combined probability and fair odds, and flag correlation or line-up risk), " +
                  "and 'Avoid' (1-2 bullets on the weakest or most volatile signals). Be concise and never promise profit.",
              },
              {
                role: "user",
                content:
                  `${historyLine}\n\nToday's calibrated signals:\n${shortlist
                    .map(
                      (row) =>
                        `- ${row.fixture} (${row.league}, ${new Date(row.kickoffAt).toISOString().slice(11, 16)} UTC): ${row.selection} — ${(row.adjustedProbability * 100).toFixed(1)}% @ ${row.fairOdds.toFixed(2)} [raw ${(row.probability * 100).toFixed(1)}%, market ${row.market}, line-up ${row.lineupStatus}]${row.confidence ? `, model confidence ${(row.confidence * 100).toFixed(0)}%` : ""}`,
                    )
                    .join("\n")}` +
                  (builder
                    ? `\n\nPre-built accumulator (one leg per match, independent): ${builder.legs
                        .map((leg) => `${leg.selection} (${(leg.probability * 100).toFixed(1)}%)`)
                        .join(" + ")} = ${(builder.probability * 100).toFixed(1)}% @ ${builder.fairOdds.toFixed(2)}`
                    : ""),
              },
            ],
          }),
        });
        if (response.ok) {
          const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
          brief = payload.choices?.[0]?.message?.content ?? null;
        }
      } catch {
        brief = null;
      }
    }

    return {
      candidates: shortlist,
      builder,
      history: historyRun,
      brief,
      generatedAt: now.toISOString(),
      reason: "ok" as const,
    };
  });
