export type ProviderId = "football_data" | "api_football";

export type MatchStatus =
  | "SCHEDULED"
  | "LIVE"
  | "PAUSED"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED"
  | "SUSPENDED";

export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; unsupported?: boolean };

export function ok<T>(data: T): ProviderResult<T> {
  return { ok: true, data };
}

export function fail<T>(error: string): ProviderResult<T> {
  return { ok: false, error };
}

export function unsupported<T>(what: string): ProviderResult<T> {
  return { ok: false, error: `${what} is not supported in this phase`, unsupported: true };
}

export interface NormalizedCompetition {
  providerId: string;
  name: string;
  shortName: string | null;
  country: string | null;
  countryCode: string | null;
  tier: number | null;
  logoUrl: string | null;
  currentSeason: string | null;
}

export interface NormalizedTeam {
  providerId: string;
  name: string;
  shortName: string | null;
  tla: string | null;
  country: string | null;
  founded: number | null;
  crestUrl: string | null;
}

export interface NormalizedVenue {
  name: string;
  city: string | null;
  country: string | null;
  capacity: number | null;
}

export interface NormalizedMatch {
  providerMatchId: string;
  competitionProviderId: string;
  competitionName: string;
  seasonLabel: string | null;
  kickoffAt: string;
  status: MatchStatus;
  matchday: number | null;
  stage: string | null;
  homeTeam: NormalizedTeam;
  awayTeam: NormalizedTeam;
  venue: NormalizedVenue | null;
  homeScore: number | null;
  awayScore: number | null;
  homeScoreHt: number | null;
  awayScoreHt: number | null;
  minute: number | null;
  raw: unknown;
}

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface FootballProvider {
  readonly id: ProviderId;
  getCompetitions(): Promise<ProviderResult<NormalizedCompetition[]>>;
  getMatches(range: DateRange): Promise<ProviderResult<NormalizedMatch[]>>;
  getTeams(competitionProviderId: string): Promise<ProviderResult<NormalizedTeam[]>>;
  getPlayers(teamProviderId: string): Promise<ProviderResult<never[]>>;
  getOdds(providerMatchId: string): Promise<ProviderResult<never[]>>;
  getLineups(providerMatchId: string): Promise<ProviderResult<never[]>>;
}
