import { RateLimiter } from "./rate-limit.server";
import {
  fail,
  ok,
  unsupported,
  type DateRange,
  type FootballProvider,
  type MatchStatus,
  type NormalizedCompetition,
  type NormalizedMatch,
  type NormalizedTeam,
  type ProviderResult,
} from "./types";

const BASE = "https://v3.football.api-sports.io";

export const API_FOOTBALL_LEAGUES = [39, 140, 135, 78, 61, 88, 94, 40, 2, 71] as const;

function mapStatus(short: string): MatchStatus {
  switch (short) {
    case "1H":
    case "2H":
    case "ET":
    case "P":
    case "LIVE":
      return "LIVE";
    case "HT":
    case "BT":
      return "PAUSED";
    case "FT":
    case "AET":
    case "PEN":
      return "FINISHED";
    case "PST":
      return "POSTPONED";
    case "CANC":
    case "ABD":
      return "CANCELLED";
    case "SUSP":
    case "INT":
      return "SUSPENDED";
    default:
      return "SCHEDULED";
  }
}

export class ApiFootballProvider implements FootballProvider {
  readonly id = "api-football" as const;
  private readonly limiter = new RateLimiter(this.id);

  private async request<T>(path: string): Promise<ProviderResult<T>> {
    const key = process.env["API_FOOTBALL_KEY"];
    if (!key) return fail("API_FOOTBALL_KEY is not configured");

    const blocked = await this.limiter.acquire();
    if (blocked) return fail(blocked);

    try {
      const response = await fetch(`${BASE}${path}`, {
        headers: { "x-apisports-key": key },
      });
      if (!response.ok) {
        const message = `api-football ${response.status} on ${path}`;
        await this.limiter.reportError(message);
        return fail(message);
      }
      const json = (await response.json()) as T & { errors?: unknown };
      const errors = json.errors;
      if (Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0) {
        const message = `api-football error: ${JSON.stringify(errors).slice(0, 200)}`;
        await this.limiter.reportError(message);
        return fail(message);
      }
      await this.limiter.reportSuccess();
      return ok(json);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.limiter.reportError(message);
      return fail(message);
    }
  }

  async getCompetitions(): Promise<ProviderResult<NormalizedCompetition[]>> {
    const result = await this.request<{ response?: Array<Record<string, unknown>> }>(
      "/leagues?current=true",
    );
    if (!result.ok) return result;

    const competitions = (result.data.response ?? [])
      .map((entry) => {
        const league = entry["league"] as
          | { id?: number; name?: string; logo?: string }
          | undefined;
        const country = entry["country"] as { name?: string; code?: string } | undefined;
        const seasons = entry["seasons"] as Array<{ year?: number }> | undefined;
        const year = seasons?.[seasons.length - 1]?.year ?? null;
        return {
          providerId: String(league?.id ?? ""),
          name: league?.name ?? "Unknown",
          shortName: null,
          country: country?.name ?? null,
          countryCode: country?.code ?? null,
          tier: null,
          logoUrl: league?.logo ?? null,
          currentSeason: year !== null ? `${year}/${year + 1}` : null,
        } satisfies NormalizedCompetition;
      })
      .filter((competition) =>
        (API_FOOTBALL_LEAGUES as readonly number[]).includes(Number(competition.providerId)),
      );

    return ok(competitions);
  }

  async getMatches(range: DateRange): Promise<ProviderResult<NormalizedMatch[]>> {
    const matches: NormalizedMatch[] = [];
    const errors: string[] = [];

    for (const date of datesBetween(range.from, range.to)) {
      const result = await this.request<{ response?: Array<Record<string, unknown>> }>(
        `/fixtures?date=${date}`,
      );
      if (!result.ok) {
        errors.push(result.error);
        continue;
      }

      for (const entry of result.data.response ?? []) {
        const fixture = entry["fixture"] as Record<string, unknown> | undefined;
        const league = entry["league"] as Record<string, unknown> | undefined;
        const teams = entry["teams"] as Record<string, Record<string, unknown>> | undefined;
        const goals = entry["goals"] as { home?: number | null; away?: number | null } | undefined;
        const score = entry["score"] as
          | { halftime?: { home?: number | null; away?: number | null } }
          | undefined;

        const leagueId = Number(league?.["id"] ?? 0);
        if (!(API_FOOTBALL_LEAGUES as readonly number[]).includes(leagueId)) continue;

        const status = fixture?.["status"] as { short?: string; elapsed?: number | null } | undefined;
        const venue = fixture?.["venue"] as
          | { name?: string | null; city?: string | null }
          | undefined;
        const round = league?.["round"] as string | undefined;
        const matchdayMatch = round?.match(/(\d+)\s*$/);

        matches.push({
          providerMatchId: String(fixture?.["id"] ?? ""),
          competitionProviderId: String(leagueId),
          competitionName: String(league?.["name"] ?? "Unknown"),
          seasonLabel: league?.["season"] ? `${league["season"]}/${Number(league["season"]) + 1}` : null,
          kickoffAt: String(fixture?.["date"] ?? new Date().toISOString()),
          status: mapStatus(status?.short ?? "NS"),
          matchday: matchdayMatch?.[1] ? Number(matchdayMatch[1]) : null,
          stage: round ?? null,
          homeTeam: mapTeam(teams?.["home"]),
          awayTeam: mapTeam(teams?.["away"]),
          venue: venue?.name
            ? {
                name: venue.name,
                city: venue.city ?? null,
                country: String(league?.["country"] ?? "") || null,
                capacity: null,
              }
            : null,
          homeScore: goals?.home ?? null,
          awayScore: goals?.away ?? null,
          homeScoreHt: score?.halftime?.home ?? null,
          awayScoreHt: score?.halftime?.away ?? null,
          minute: status?.elapsed ?? null,
          raw: entry,
        });
      }
    }

    if (matches.length === 0 && errors.length > 0) return fail(errors.join("; "));
    return ok(matches);
  }

  async getTeams(competitionProviderId: string): Promise<ProviderResult<NormalizedTeam[]>> {
    const result = await this.request<{ response?: Array<Record<string, unknown>> }>(
      `/teams?league=${competitionProviderId}&season=${new Date().getFullYear()}`,
    );
    if (!result.ok) return result;
    return ok(
      (result.data.response ?? []).map((entry) =>
        mapTeam(entry["team"] as Record<string, unknown> | undefined),
      ),
    );
  }

  async getPlayers(): Promise<ProviderResult<never[]>> {
    return unsupported("Players");
  }

  async getOdds(): Promise<ProviderResult<never[]>> {
    return unsupported("Odds");
  }

  async getLineups(): Promise<ProviderResult<never[]>> {
    return unsupported("Lineups");
  }
}

function mapTeam(team: Record<string, unknown> | undefined): NormalizedTeam {
  return {
    providerId: String(team?.["id"] ?? ""),
    name: String(team?.["name"] ?? "Unknown"),
    shortName: null,
    tla: (team?.["code"] as string | undefined) ?? null,
    country: (team?.["country"] as string | undefined) ?? null,
    founded: (team?.["founded"] as number | undefined) ?? null,
    crestUrl: (team?.["logo"] as string | undefined) ?? null,
  };
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
