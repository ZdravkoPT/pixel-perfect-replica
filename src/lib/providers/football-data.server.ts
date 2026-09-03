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
import type { NormalizedSquad } from "./intel-types";


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
  readonly id = "football_data" as const;
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

    return ok(this.mapMatches(result.data.matches ?? []));
  }

  private mapMatches(rawMatches: Array<Record<string, unknown>>): NormalizedMatch[] {
    const matches = rawMatches.map((raw) => {
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

    return matches.filter((match) => match.competitionProviderId !== "");
  }

  /** Full season match list for one competition (used for historical bootstrap). */
  async getCompetitionMatches(
    competitionProviderId: string,
    season: number,
  ): Promise<ProviderResult<NormalizedMatch[]>> {
    const result = await this.request<{ matches?: Array<Record<string, unknown>> }>(
      `/competitions/${competitionProviderId}/matches?season=${season}`,
    );
    if (!result.ok) return result;
    return ok(this.mapMatches(result.data.matches ?? []));
  }

  async getTeams(competitionProviderId: string): Promise<ProviderResult<NormalizedTeam[]>> {
    const result = await this.request<{ teams?: FdTeam[] }>(
      `/competitions/${competitionProviderId}/teams`,
    );
    if (!result.ok) return result;
    return ok((result.data.teams ?? []).map((team) => mapTeam(team)));
  }

  /**
   * Squads (players + coach) for every team of a competition.
   * football-data.org exposes this on the free tier, so it is our primary
   * player source.
   */
  async getSquads(competitionProviderId: string): Promise<ProviderResult<NormalizedSquad[]>> {
    const result = await this.request<{ teams?: Array<Record<string, unknown>> }>(
      `/competitions/${competitionProviderId}/teams`,
    );
    if (!result.ok) return result;

    const squads = (result.data.teams ?? []).map((team) => {
      const coachRaw = team["coach"] as
        | { id?: number; name?: string; nationality?: string | null; dateOfBirth?: string | null }
        | undefined;
      const squad = (team["squad"] as Array<Record<string, unknown>> | undefined) ?? [];

      return {
        teamProviderId: String(team["id"] ?? ""),
        teamName: String(team["name"] ?? "Unknown"),
        coach:
          coachRaw?.id && coachRaw.name
            ? {
                providerId: String(coachRaw.id),
                name: coachRaw.name,
                nationality: coachRaw.nationality ?? null,
                birthDate: coachRaw.dateOfBirth ?? null,
              }
            : null,
        players: squad
          .filter((player) => player["id"] && player["name"])
          .map((player) => ({
            providerId: String(player["id"]),
            name: String(player["name"]),
            position: (player["position"] as string | null | undefined) ?? null,
            birthDate: (player["dateOfBirth"] as string | null | undefined) ?? null,
            nationality: (player["nationality"] as string | null | undefined) ?? null,
            shirtNumber: (player["shirtNumber"] as number | null | undefined) ?? null,
          })),
      } satisfies NormalizedSquad;
    });

    return ok(squads);
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

  /**
   * Match detail used by the T-60 refresh. On the free tier the `lineup` and
   * `bench` arrays are usually empty, so callers must fall back to the
   * projected line-up; they populate automatically on richer plans.
   */
  async getMatchSheet(providerMatchId: string): Promise<ProviderResult<MatchSheet>> {
    const result = await this.request<Record<string, unknown>>(`/matches/${providerMatchId}`);
    if (!result.ok) return result;

    const raw = result.data;
    const side = (key: "homeTeam" | "awayTeam"): MatchSheetSide => {
      const team = (raw[key] as Record<string, unknown> | undefined) ?? {};
      const map = (list: unknown): MatchSheetPlayer[] =>
        ((list as Array<Record<string, unknown>> | undefined) ?? [])
          .filter((player) => player["id"] && player["name"])
          .map((player) => ({
            providerId: String(player["id"]),
            name: String(player["name"]),
            position: (player["position"] as string | null | undefined) ?? null,
            shirtNumber: (player["shirtNumber"] as number | null | undefined) ?? null,
          }));
      const coach = team["coach"] as { id?: number; name?: string } | undefined;
      return {
        formation: (team["formation"] as string | null | undefined) ?? null,
        coachProviderId: coach?.id ? String(coach.id) : null,
        coachName: coach?.name ?? null,
        lineup: map(team["lineup"]),
        bench: map(team["bench"]),
      };
    };

    return ok({
      status: mapStatus(String(raw["status"] ?? "SCHEDULED")),
      home: side("homeTeam"),
      away: side("awayTeam"),
    });
  }
}

export interface MatchSheetPlayer {
  providerId: string;
  name: string;
  position: string | null;
  shirtNumber: number | null;
}

export interface MatchSheetSide {
  formation: string | null;
  coachProviderId: string | null;
  coachName: string | null;
  lineup: MatchSheetPlayer[];
  bench: MatchSheetPlayer[];
}

export interface MatchSheet {
  status: MatchStatus;
  home: MatchSheetSide;
  away: MatchSheetSide;
}

