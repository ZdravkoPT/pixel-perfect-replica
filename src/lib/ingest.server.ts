import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ApiFootballProvider } from "./providers/api-football.server";
import { FootballDataProvider } from "./providers/football-data.server";
import { matchCanonicalId, normalizeTeamName, similarity, slugify } from "./providers/normalize";
import type { NormalizedMatch, NormalizedTeam, ProviderId } from "./providers/types";

export interface IngestionSummary {
  jobId: string;
  status: "success" | "partial" | "failed";
  processed: number;
  inserted: number;
  updated: number;
  errors: number;
  durationMs: number;
}

const SIMILARITY_THRESHOLD = 0.88;

interface TeamRow {
  id: string;
  canonical_id: string;
  name: string;
  provider_ids: Record<string, string>;
}

class TeamResolver {
  private byProvider = new Map<string, TeamRow>();
  private byAlias = new Map<string, TeamRow>();
  private all: TeamRow[] = [];

  async load(): Promise<void> {
    const { data: teams } = await supabaseAdmin
      .from("teams")
      .select("id, canonical_id, name, provider_ids");
    const { data: aliases } = await supabaseAdmin
      .from("team_aliases")
      .select("team_id, normalized_alias");

    this.all = (teams ?? []).map((team) => ({
      id: team.id,
      canonical_id: team.canonical_id,
      name: team.name,
      provider_ids: (team.provider_ids as Record<string, string> | null) ?? {},
    }));

    const byId = new Map(this.all.map((team) => [team.id, team]));
    for (const team of this.all) {
      for (const [provider, providerId] of Object.entries(team.provider_ids)) {
        this.byProvider.set(`${provider}:${providerId}`, team);
      }
      this.byAlias.set(normalizeTeamName(team.name), team);
    }
    for (const alias of aliases ?? []) {
      const team = byId.get(alias.team_id);
      if (team) this.byAlias.set(alias.normalized_alias, team);
    }
  }

  async resolve(provider: ProviderId, team: NormalizedTeam): Promise<string> {
    const providerKey = `${provider}:${team.providerId}`;
    const existingByProvider = this.byProvider.get(providerKey);
    if (existingByProvider) return existingByProvider.id;

    const normalized = normalizeTeamName(team.name);
    let candidate = this.byAlias.get(normalized) ?? null;

    if (!candidate) {
      let best = 0;
      for (const row of this.all) {
        const score = similarity(normalized, normalizeTeamName(row.name));
        if (score > best) {
          best = score;
          candidate = row;
        }
      }
      if (best < SIMILARITY_THRESHOLD) candidate = null;
    }

    if (candidate) {
      const providerIds = { ...candidate.provider_ids, [provider]: team.providerId };
      await supabaseAdmin.from("teams").update({ provider_ids: providerIds }).eq("id", candidate.id);
      candidate.provider_ids = providerIds;
      this.byProvider.set(providerKey, candidate);
      this.byAlias.set(normalized, candidate);
      await supabaseAdmin.from("team_aliases").upsert(
        { team_id: candidate.id, alias: team.name, normalized_alias: normalized, source: provider },
        { onConflict: "team_id,normalized_alias", ignoreDuplicates: true },
      );
      return candidate.id;
    }

    const canonicalId = `team:${normalized}`;
    const { data: inserted } = await supabaseAdmin
      .from("teams")
      .upsert(
        {
          canonical_id: canonicalId,
          name: team.name,
          short_name: team.shortName,
          tla: team.tla,
          country: team.country,
          founded: team.founded,
          crest_url: team.crestUrl,
          provider_ids: { [provider]: team.providerId },
        },
        { onConflict: "canonical_id" },
      )
      .select("id, canonical_id, name, provider_ids")
      .single();

    if (!inserted) throw new Error(`Could not persist team ${team.name}`);

    const row: TeamRow = {
      id: inserted.id,
      canonical_id: inserted.canonical_id,
      name: inserted.name,
      provider_ids: (inserted.provider_ids as Record<string, string> | null) ?? {},
    };
    this.all.push(row);
    this.byProvider.set(providerKey, row);
    this.byAlias.set(normalized, row);
    await supabaseAdmin.from("team_aliases").upsert(
      { team_id: row.id, alias: team.name, normalized_alias: normalized, source: provider },
      { onConflict: "team_id,normalized_alias", ignoreDuplicates: true },
    );
    return row.id;
  }
}

async function upsertLeague(
  provider: ProviderId,
  match: NormalizedMatch,
): Promise<{ leagueId: string; canonicalId: string; seasonId: string | null }> {
  const canonicalId = `league:${slugify(match.competitionName)}`;

  const { data: existing } = await supabaseAdmin
    .from("leagues")
    .select("id, provider_ids")
    .eq("canonical_id", canonicalId)
    .maybeSingle();

  let leagueId: string;
  if (existing) {
    leagueId = existing.id;
    const providerIds = {
      ...((existing.provider_ids as Record<string, string> | null) ?? {}),
      [provider]: match.competitionProviderId,
    };
    await supabaseAdmin.from("leagues").update({ provider_ids: providerIds }).eq("id", leagueId);
  } else {
    const { data: created } = await supabaseAdmin
      .from("leagues")
      .upsert(
        {
          canonical_id: canonicalId,
          name: match.competitionName,
          provider_ids: { [provider]: match.competitionProviderId },
        },
        { onConflict: "canonical_id" },
      )
      .select("id")
      .single();
    if (!created) throw new Error(`Could not persist league ${match.competitionName}`);
    leagueId = created.id;
  }

  let seasonId: string | null = null;
  if (match.seasonLabel) {
    const { data: season } = await supabaseAdmin
      .from("seasons")
      .select("id")
      .eq("league_id", leagueId)
      .eq("year_label", match.seasonLabel)
      .maybeSingle();
    if (season) {
      seasonId = season.id;
    } else {
      const { data: createdSeason } = await supabaseAdmin
        .from("seasons")
        .insert({ league_id: leagueId, year_label: match.seasonLabel, is_current: true })
        .select("id")
        .single();
      seasonId = createdSeason?.id ?? null;
    }
  }

  return { leagueId, canonicalId, seasonId };
}

async function logConflict(params: {
  canonicalId: string;
  matchId: string;
  field: string;
  sourceA: ProviderId;
  valueA: unknown;
  sourceB: ProviderId;
  valueB: unknown;
}): Promise<void> {
  await supabaseAdmin.from("provider_conflicts").insert({
    entity_type: "match",
    entity_id: params.matchId,
    canonical_id: params.canonicalId,
    field: params.field,
    source_a: params.sourceA,
    value_a: params.valueA as never,
    source_b: params.sourceB,
    value_b: params.valueB as never,
  });
}

export async function ingestFixtures(options: {
  days?: number;
  triggeredBy?: string;
} = {}): Promise<IngestionSummary> {
  const days = options.days ?? 7;
  const triggeredBy = options.triggeredBy ?? "cron";
  const startedAt = Date.now();

  const { data: job } = await supabaseAdmin
    .from("ingestion_jobs")
    .insert({ job_type: "fixtures", status: "running", triggered_by: triggeredBy })
    .select("id")
    .single();
  const jobId = job?.id ?? "";

  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let errorCount = 0;

  const recordError = async (sourceId: ProviderId | null, stage: string, message: string) => {
    errorCount += 1;
    await supabaseAdmin.from("ingestion_errors").insert({
      job_id: jobId || null,
      source_id: sourceId,
      stage,
      message: message.slice(0, 1000),
    });
  };

  const resolver = new TeamResolver();
  await resolver.load();

  const primary = new FootballDataProvider();
  const secondary = new ApiFootballProvider();

  const primaryResult = await primary.getMatches({ from, to });
  if (!primaryResult.ok) await recordError(primary.id, "fetch", primaryResult.error);
  const secondaryResult = await secondary.getMatches({ from, to });
  if (!secondaryResult.ok) await recordError(secondary.id, "fetch", secondaryResult.error);

  const secondaryMatches = secondaryResult.ok ? secondaryResult.data : [];
  const usedSecondary = new Set<string>();

  const persist = async (
    provider: ProviderId,
    match: NormalizedMatch,
    counterpart: NormalizedMatch | null,
  ) => {
    const { leagueId, canonicalId: leagueCanonical, seasonId } = await upsertLeague(provider, match);
    const homeTeamId = await resolver.resolve(provider, match.homeTeam);
    const awayTeamId = await resolver.resolve(provider, match.awayTeam);
    const canonicalId = matchCanonicalId(
      leagueCanonical,
      match.kickoffAt,
      match.homeTeam.name,
      match.awayTeam.name,
    );

    const { data: existing } = await supabaseAdmin
      .from("matches")
      .select("id, provider_ids, kickoff_at, home_score, away_score")
      .eq("canonical_id", canonicalId)
      .maybeSingle();

    const providerIds: Record<string, string> = {
      ...((existing?.provider_ids as Record<string, string> | null) ?? {}),
      [provider]: match.providerMatchId,
    };
    if (counterpart) providerIds["api-football"] = counterpart.providerMatchId;

    const payload = {
      canonical_id: canonicalId,
      league_id: leagueId,
      season_id: seasonId,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      kickoff_at: match.kickoffAt,
      status: match.status,
      matchday: match.matchday,
      stage: match.stage,
      home_score: match.homeScore,
      away_score: match.awayScore,
      home_score_ht: match.homeScoreHt,
      away_score_ht: match.awayScoreHt,
      minute: match.minute,
      provider_ids: providerIds,
      last_ingested_at: new Date().toISOString(),
    };

    const { data: saved } = await supabaseAdmin
      .from("matches")
      .upsert(payload, { onConflict: "canonical_id" })
      .select("id")
      .single();

    if (!saved) throw new Error(`Could not persist match ${canonicalId}`);
    if (existing) updated += 1;
    else inserted += 1;

    await supabaseAdmin.from("match_sources").upsert(
      {
        match_id: saved.id,
        source_id: provider,
        provider_match_id: match.providerMatchId,
        payload: match.raw as never,
      },
      { onConflict: "source_id,provider_match_id" },
    );

    if (counterpart) {
      await supabaseAdmin.from("match_sources").upsert(
        {
          match_id: saved.id,
          source_id: "api-football",
          provider_match_id: counterpart.providerMatchId,
          payload: counterpart.raw as never,
        },
        { onConflict: "source_id,provider_match_id" },
      );

      const driftMs = Math.abs(
        new Date(counterpart.kickoffAt).getTime() - new Date(match.kickoffAt).getTime(),
      );
      if (driftMs > 15 * 60_000) {
        await logConflict({
          canonicalId,
          matchId: saved.id,
          field: "kickoff_at",
          sourceA: provider,
          valueA: match.kickoffAt,
          sourceB: "api-football",
          valueB: counterpart.kickoffAt,
        });
      }
      if (
        match.status === "FINISHED" &&
        counterpart.status === "FINISHED" &&
        (match.homeScore !== counterpart.homeScore || match.awayScore !== counterpart.awayScore)
      ) {
        await logConflict({
          canonicalId,
          matchId: saved.id,
          field: "score",
          sourceA: provider,
          valueA: { home: match.homeScore, away: match.awayScore },
          sourceB: "api-football",
          valueB: { home: counterpart.homeScore, away: counterpart.awayScore },
        });
      }
    }
  };

  if (primaryResult.ok) {
    for (const match of primaryResult.data) {
      processed += 1;
      try {
        const counterpart =
          secondaryMatches.find((candidate) => {
            if (usedSecondary.has(candidate.providerMatchId)) return false;
            const sameHome =
              similarity(
                normalizeTeamName(candidate.homeTeam.name),
                normalizeTeamName(match.homeTeam.name),
              ) >= SIMILARITY_THRESHOLD;
            const sameAway =
              similarity(
                normalizeTeamName(candidate.awayTeam.name),
                normalizeTeamName(match.awayTeam.name),
              ) >= SIMILARITY_THRESHOLD;
            const sameDay = candidate.kickoffAt.slice(0, 10) === match.kickoffAt.slice(0, 10);
            return sameHome && sameAway && sameDay;
          }) ?? null;
        if (counterpart) usedSecondary.add(counterpart.providerMatchId);
        await persist(primary.id, match, counterpart);
      } catch (error) {
        await recordError(
          primary.id,
          "persist",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  for (const match of secondaryMatches) {
    if (usedSecondary.has(match.providerMatchId)) continue;
    processed += 1;
    try {
      await persist(secondary.id, match, null);
    } catch (error) {
      await recordError(
        secondary.id,
        "persist",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const durationMs = Date.now() - startedAt;
  const status: IngestionSummary["status"] =
    processed === 0 && errorCount > 0 ? "failed" : errorCount > 0 ? "partial" : "success";

  if (jobId) {
    await supabaseAdmin
      .from("ingestion_jobs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        records_processed: processed,
        records_inserted: inserted,
        records_updated: updated,
        error_count: errorCount,
        details: { from, to, days },
      })
      .eq("id", jobId);
  }

  return { jobId, status, processed, inserted, updated, errors: errorCount, durationMs };
}
