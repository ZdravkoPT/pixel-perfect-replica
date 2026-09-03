import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

async function assertAdmin(context: { supabase: ReturnType<typeof publicClient>; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden: admin role required");
}

/** Latest prediction (with markets and explanations) for one match. */
export const getMatchPrediction = createServerFn({ method: "GET" })
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: prediction } = await supabase
      .from("predictions")
      .select(
        "id, prediction_timestamp, p_home, p_draw, p_away, lambda_home, lambda_away, expected_goals, p_over_25, p_under_25, p_btts, confidence, top_scoreline, model_version_id",
      )
      .eq("match_id", data.matchId)
      .order("prediction_timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!prediction) return { prediction: null, markets: [], explanations: [], features: null, model: null };

    const [{ data: markets }, { data: explanations }, { data: model }, { data: features }] =
      await Promise.all([
        supabase
          .from("prediction_markets")
          .select("market, selection, probability, fair_odds")
          .eq("prediction_id", prediction.id),
        supabase
          .from("prediction_explanations")
          .select("feature, label, value, contribution, direction, rank")
          .eq("prediction_id", prediction.id)
          .order("rank", { ascending: true }),
        supabase
          .from("model_versions")
          .select("id, name, kind, version, trained_at, training_samples, metrics")
          .eq("id", prediction.model_version_id)
          .maybeSingle(),
        supabase
          .from("match_features")
          .select("*")
          .eq("match_id", data.matchId)
          .order("feature_timestamp", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    return {
      prediction,
      markets: markets ?? [],
      explanations: explanations ?? [],
      features: features ?? null,
      model: model ?? null,
    };
  });

/** Highest-confidence upcoming picks for the dashboard. */
export const listTopPredictions = createServerFn({ method: "GET" })
  .inputValidator((input: { limit?: number } | undefined) => ({ limit: input?.limit ?? 6 }))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: rows } = await supabase
      .from("predictions")
      .select(
        "id, match_id, p_home, p_draw, p_away, expected_goals, confidence, top_scoreline, prediction_timestamp, match:matches!inner(id, kickoff_at, status, home:teams!matches_home_team_id_fkey(name, tla), away:teams!matches_away_team_id_fkey(name, tla), league:leagues(name))",
      )
      .gte("match.kickoff_at", new Date().toISOString())
      .order("confidence", { ascending: false })
      .limit(200);

    const seen = new Set<string>();
    const picks = (rows ?? []).filter((row) => {
      if (seen.has(row.match_id)) return false;
      seen.add(row.match_id);
      return true;
    });

    return { picks: picks.slice(0, data.limit) };
  });

/** Model versions, training runs and backtest results for the analytics page. */
export const getModelOverview = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const [{ data: models }, { data: runs }, { data: backtests }, { data: ratings }] =
    await Promise.all([
      supabase
        .from("model_versions")
        .select("id, name, kind, version, trained_at, training_samples, params, metrics, is_active")
        .order("trained_at", { ascending: false })
        .limit(10),
      supabase
        .from("model_training_runs")
        .select("id, status, started_at, duration_ms, samples, matches_scored, metrics, error")
        .order("started_at", { ascending: false })
        .limit(10),
      supabase
        .from("backtests")
        .select(
          "id, status, window_from, window_to, samples, accuracy, log_loss, brier, calibration, started_at, duration_ms, error",
        )
        .order("started_at", { ascending: false })
        .limit(5),
      supabase
        .from("team_ratings")
        .select("rating, attack, defence, matches_played, as_of, team:teams(name, tla, crest_url)")
        .order("as_of", { ascending: false })
        .order("rating", { ascending: false })
        .limit(20),
    ]);

  return {
    models: models ?? [],
    runs: runs ?? [],
    backtests: backtests ?? [],
    ratings: ratings ?? [],
  };
});

export const trainModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { runAnalytics } = await import("./analytics.server");
    return runAnalytics({ triggeredBy: "manual" });
  });

export const startBacktest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { runBacktest } = await import("./analytics.server");
    return runBacktest({ triggeredBy: "manual" });
  });

export const syncHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { seasons?: number[] } | undefined) => ({
    seasons: input?.seasons ?? [new Date().getUTCFullYear() - 1, new Date().getUTCFullYear()],
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { ingestHistory } = await import("./ingest.server");
    return ingestHistory({ seasons: data.seasons, triggeredBy: "manual" });
  });
