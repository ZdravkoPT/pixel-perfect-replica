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

const BASE = "https://api.football-data.org/v4";

export const FOOTBALL_DATA_COMPETITIONS = [
  "PL", "PD", "SA", "BL1", "FL1", "DED", "PPL", "ELC", "CL", "BSA",
] as const;

function mapStatus(status: string): MatchStatus {
  switch (status) {
    case "IN_PLAY":
      return "LIVE";
    case "PAUSED":
      return "PAUSED";
    case "FINISHED":
    case "AWARDED":
      return "FINISHED";
    case "POSTPONED":
      return "POSTPONED";
    case "CANCELLED":
      return "CANCELLED";
    case "SUSPENDED":
      return "SUSPENDED";
    default:
      return "SCHEDULED";
  }
}

interface FdTeam {
  id?: number;
  name?: string;
  shortName?: string | null;
  tla?: string | null;
  crest?: string | null;
  area?: { name?: string } | null;
  founded?: number | null;
}

function mapTeam(team: FdTeam | undefined): NormalizedTeam {
  return {
    providerId: String(team?.id ?? ""),
    name: team?.name ?? "Unknown",
    shortName: team?.shortName ?? null,
    tla: team?.tla ?? null,
    country: team?.area?.name ?? null,
    founded: team?.founded ?? null,
    crestUrl: team?.crest ?? null,
  };
}

export class FootballDataProvider implements FootballProvider {
  readonly id = "football-data-org" as const;
  private readonly limiter = new RateLimiter(this.id);

  private async request<T>(path: string): Promise<ProviderResult<T>> {
    const key = process.env["FOOTBALL_DATA_ORG_KEY"];
    if (!key) return fail("FOOTBALL_DATA_ORG_KEY is not configured");

    const blocked = await this.limiter.acquire();
    if (blocked) return fail(blocked);

    try {
      const response = await fetch(`${BASE}${path}`, {
        headers: { "X-Auth-Token": key },
      });
      if (!response.ok) {
        const message = `football-data.org ${response.status} on ${path}`;
        await this.limiter.reportError(message);
        return fail(message);
      }
      const json = (await response.json()) as T;
      await this.limiter.reportSuccess();
      return ok(json);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.limiter.reportError(message);
      return fail(message);
    }
  }

  async getCompetitions(): Promise<ProviderResult<NormalizedCompetition[]>> {
    const result = await this.request<{ competitions?: Array<Record<string, unknown>> }>(
      `/competitions?code=${FOOTBALL_DATA_COMPETITIONS.join(",")}`,
    );
    if (!result.ok) return result;

    const competitions = (result.data.competitions ?? []).map((raw) => {
      const area = raw["area"] as { name?: string; code?: string } | undefined;
      const season = raw["currentSeason"] as { startDate?: string; endDate?: string } | undefined;
      return {
        providerId: String(raw["code"] ?? raw["id"] ?? ""),
        name: String(raw["name"] ?? "Unknown"),
        shortName: (raw["code"] as string | undefined) ?? null,
        country: area?.name ?? null,
        countryCode: area?.code ?? null,
        tier: raw["type"] === "LEAGUE" ? 1 : null,
        logoUrl: (raw["emblem"] as string | undefined) ?? null,
        currentSeason: season?.startDate
          ? `${season.startDate.slice(0, 4)}/${(season.endDate ?? "").slice(0, 4)}`
          : null,
      } satisfies NormalizedCompetition;
    });

    return ok(competitions);
  }

  async getMatches(range: DateRange): Promise<ProviderResult<NormalizedMatch[]>> {
    const result = await this.request<{ matches?: Array<Record<string, unknown>> }>(
      `/matches?dateFrom=${range.from}&dateTo=${range.to}&competitions=${FOOTBALL_DATA_COMPETITIONS.join(",")}`,
    );
    if (!result.ok) return result;

    const matches = (result.data.matches ?? []).map((raw) => {
      const competition = raw["competition"] as { code?: string; name?: string } | undefined;
      const season = raw["season"] as { startDate?: string; endDate?: string } | undefined;
      const score = raw["score"] as
        | {
            fullTime?: { home?: number | null; away?: number | null };
            halfTime?: { home?: number | null; away?: number | null };
          }
        | undefined;

      return {
        providerMatchId: String(raw["id"] ?? ""),
        competitionProviderId: String(competition?.code ?? ""),
        competitionName: competition?.name ?? "Unknown",
        seasonLabel: season?.startDate
          ? `${season.startDate.slice(0, 4)}/${(season.endDate ?? "").slice(0, 4)}`
          : null,
        kickoffAt: String(raw["utcDate"] ?? new Date().toISOString()),
        status: mapStatus(String(raw["status"] ?? "SCHEDULED")),
        matchday: (raw["matchday"] as number | null | undefined) ?? null,
        stage: (raw["stage"] as string | null | undefined) ?? null,
        homeTeam: mapTeam(raw["homeTeam"] as FdTeam | undefined),
        awayTeam: mapTeam(raw["awayTeam"] as FdTeam | undefined),
        venue: null,
        homeScore: score?.fullTime?.home ?? null,
        awayScore: score?.fullTime?.away ?? null,
        homeScoreHt: score?.halfTime?.home ?? null,
        awayScoreHt: score?.halfTime?.away ?? null,
        minute: null,
        raw,
      } satisfies NormalizedMatch;
    });

    return ok(matches.filter((match) => match.competitionProviderId !== ""));
  }

  async getTeams(competitionProviderId: string): Promise<ProviderResult<NormalizedTeam[]>> {
    const result = await this.request<{ teams?: FdTeam[] }>(
      `/competitions/${competitionProviderId}/teams`,
    );
    if (!result.ok) return result;
    return ok((result.data.teams ?? []).map((team) => mapTeam(team)));
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
