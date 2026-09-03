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

const MATCH_SELECT =
  "id, canonical_id, kickoff_at, status, minute, matchday, stage, home_score, away_score, home_score_ht, away_score_ht, provider_ids, league:leagues(id, name, country, logo_url), home:teams!matches_home_team_id_fkey(id, name, short_name, tla, crest_url), away:teams!matches_away_team_id_fkey(id, name, short_name, tla, crest_url), venue:venues(id, name, city)";

export const listMatches = createServerFn({ method: "GET" })
  .inputValidator((input: { days?: number } | undefined) => ({ days: input?.days ?? 7 }))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + data.days * 86_400_000);

    const { data: matches, error } = await supabase
      .from("matches")
      .select(MATCH_SELECT)
      .gte("kickoff_at", from.toISOString())
      .lte("kickoff_at", to.toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(500);

    if (error) return { matches: [], error: error.message };
    return { matches: matches ?? [], error: null };
  });

export const getMatchDetail = createServerFn({ method: "GET" })
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: match, error } = await supabase
      .from("matches")
      .select(MATCH_SELECT)
      .eq("id", data.matchId)
      .maybeSingle();

    if (error) return { match: null, sources: [], error: error.message };

    const { data: sources } = await supabase
      .from("match_sources")
      .select("source_id, provider_match_id, ingested_at")
      .eq("match_id", data.matchId);

    return { match, sources: sources ?? [], error: null };
  });

export const getProviderHealth = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data: sources } = await supabase
    .from("data_sources")
    .select(
      "id, name, status, priority, license, rate_limit_per_min, rate_limit_per_day, requests_this_minute, requests_today, last_request_at, last_success_at, last_error_at, last_error",
    )
    .order("priority", { ascending: true });

  const { data: jobs } = await supabase
    .from("ingestion_jobs")
    .select(
      "id, job_type, source_id, status, started_at, finished_at, duration_ms, records_processed, records_inserted, records_updated, error_count, triggered_by",
    )
    .order("started_at", { ascending: false })
    .limit(20);

  return { sources: sources ?? [], jobs: jobs ?? [] };
});

export const triggerIngestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => ({ days: input?.days ?? 7 }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const { ingestFixtures } = await import("./ingest.server");
    return ingestFixtures({ days: data.days, triggeredBy: "manual" });
  });

export const getDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { isAdmin: false, errors: [], conflicts: [] };

    const { data: errors } = await context.supabase
      .from("ingestion_errors")
      .select("id, source_id, stage, message, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: conflicts } = await context.supabase
      .from("provider_conflicts")
      .select("id, entity_type, field, source_a, value_a, source_b, value_b, detected_at, resolved")
      .order("detected_at", { ascending: false })
      .limit(50);

    return { isAdmin: true, errors: errors ?? [], conflicts: conflicts ?? [] };
  });
