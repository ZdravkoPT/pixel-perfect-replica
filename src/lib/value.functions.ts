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
    const [{ data: predictions }, { data: props }] = await Promise.all([
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
    ]);

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

      const propRows = (propsByMatch.get(match.id) ?? [])
        .slice()
        .sort((a, b) => Number(b.probability) - Number(a.probability))
        .slice(0, 6)
        .map((row) => ({
          player: row.player?.name ?? "Unknown",
          position: row.player?.position ?? null,
          team: row.team_id === match.home_team_id ? (match.home?.name ?? "Home") : (match.away?.name ?? "Away"),
          market: row.market,
          selection: row.selection,
          probability: Number(row.probability),
          fairOdds: Number(row.fair_odds),
          expectedMinutes: row.expected_minutes === null ? null : Number(row.expected_minutes),
        }));

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
  selection: string;
  probability: number;
  fairOdds: number;
  confidence: number | null;
  kind: "match" | "player";
};

/**
 * Today's strongest model signals plus an AI-written betting / bet-builder brief.
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
      return { candidates: [], brief: null, generatedAt: now.toISOString(), reason: "no-fixtures" as const };
    }

    const ids = rows.map((row) => row.id);
    const [{ data: predictions }, { data: props }] = await Promise.all([
      supabase
        .from("predictions")
        .select("match_id, prediction_timestamp, p_home, p_draw, p_away, p_over_25, p_under_25, p_btts, confidence")
        .in("match_id", ids)
        .order("prediction_timestamp", { ascending: false }),
      supabase
        .from("player_prop_predictions")
        .select("match_id, market, selection, probability, fair_odds, team_id, player:players(name)")
        .in("match_id", ids)
        .gte("probability", min)
        .order("probability", { ascending: false })
        .limit(60),
    ]);

    const latest = new Map<string, NonNullable<typeof predictions>[number]>();
    for (const row of predictions ?? []) if (!latest.has(row.match_id)) latest.set(row.match_id, row);

    const candidates: Candidate[] = [];
    for (const match of rows) {
      const prediction = latest.get(match.id);
      if (!prediction) continue;
      const fixture = `${match.home?.name ?? "Home"} vs ${match.away?.name ?? "Away"}`;
      const options: Array<[string, number | null]> = [
        [`${match.home?.name ?? "Home"} to win`, Number(prediction.p_home)],
        ["Draw", Number(prediction.p_draw)],
        [`${match.away?.name ?? "Away"} to win`, Number(prediction.p_away)],
        ["Over 2.5 goals", prediction.p_over_25 === null ? null : Number(prediction.p_over_25)],
        ["Under 2.5 goals", prediction.p_under_25 === null ? null : Number(prediction.p_under_25)],
        ["Both teams to score", prediction.p_btts === null ? null : Number(prediction.p_btts)],
      ];
      for (const [selection, probability] of options) {
        if (probability === null || probability < min) continue;
        candidates.push({
          matchId: match.id,
          fixture,
          league: match.league?.name ?? "Unknown league",
          kickoffAt: match.kickoff_at,
          selection,
          probability,
          fairOdds: odds(probability),
          confidence: prediction.confidence === null ? null : Number(prediction.confidence),
          kind: "match",
        });
      }
    }

    for (const row of props ?? []) {
      const match = rows.find((item) => item.id === row.match_id);
      if (!match) continue;
      candidates.push({
        matchId: row.match_id,
        fixture: `${match.home?.name ?? "Home"} vs ${match.away?.name ?? "Away"}`,
        league: match.league?.name ?? "Unknown league",
        kickoffAt: match.kickoff_at,
        selection: `${row.player?.name ?? "Player"} · ${row.selection.replace(/_/g, " ")}`,
        probability: Number(row.probability),
        fairOdds: Number(row.fair_odds),
        confidence: null,
        kind: "player",
      });
    }

    candidates.sort((a, b) => b.probability - a.probability);
    const shortlist = candidates.slice(0, 24);

    if (shortlist.length === 0) {
      return { candidates: [], brief: null, generatedAt: now.toISOString(), reason: "no-signals" as const };
    }

    let brief: string | null = null;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (apiKey) {
      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "You are a disciplined football betting analyst. You only use the model probabilities supplied. " +
                  "No bookmaker prices are available, so never claim a price is above or below the market. " +
                  "Answer in markdown with three short sections: 'Top singles' (max 4 bullets, each with the model probability and fair odds), " +
                  "'Bet builder' (one same-game or cross-game combination, list the legs, multiply the fair odds and state the combined probability, note correlation risk), " +
                  "and 'Avoid' (1-2 bullets on the weakest or most volatile signals). Be concise and never promise profit.",
              },
              {
                role: "user",
                content: `Today's model signals (probability, fair odds):\n${shortlist
                  .map(
                    (row) =>
                      `- ${row.fixture} (${row.league}, ${new Date(row.kickoffAt).toISOString().slice(11, 16)} UTC): ${row.selection} — ${(row.probability * 100).toFixed(1)}% @ ${row.fairOdds.toFixed(2)}${row.confidence ? `, model confidence ${(row.confidence * 100).toFixed(0)}%` : ""}`,
                  )
                  .join("\n")}`,
              },
            ],
          }),
        });
        if (response.ok) {
          const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
          brief = payload.choices?.[0]?.message?.content ?? null;
        } else if (response.status === 429) {
          brief = null;
        }
      } catch {
        brief = null;
      }
    }

    return { candidates: shortlist, brief, generatedAt: now.toISOString(), reason: "ok" as const };
  });
