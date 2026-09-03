import { namesMatch } from "./normalize";
import type { MatchSheet, MatchSheetPlayer, MatchSheetSide } from "./football-data.server";
import { fail, ok, type MatchStatus, type ProviderResult } from "./types";

/**
 * FotMob public web API — free, no API key, no account.
 *
 * It is the only source we found that publishes *confirmed* starting XIs,
 * benches and coaches for every league we cover without a paid plan, so it is
 * tried first at T-60 before the paid/limited providers.
 *
 * Endpoints used (both unversioned and public):
 *   /api/data/matches?date=YYYYMMDD   → all fixtures for a day
 *   /api/data/matchDetails?matchId=ID → lineup, bench, coach, live status
 */
const BASE = "https://www.fotmob.com/api/data";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  Accept: "application/json",
};

interface FotmobPlayer {
  id?: number;
  name?: string;
  shirtNumber?: string | number | null;
  positionId?: number | null;
  usualPlayingPositionId?: number | null;
}

interface FotmobSide {
  formation?: string | null;
  starters?: FotmobPlayer[];
  subs?: FotmobPlayer[];
  coach?: { id?: number; name?: string } | null;
}

/**
 * FotMob encodes the player's usual role as 0=GK, 1=DEF, 2=MID, 3=ATT
 * (`usualPlayingPositionId`); `positionId` is a pitch-slot code and is not a
 * role, so it is only used as a coarse fallback.
 */
function positionFromRole(role: number | null | undefined): string | null {
  switch (role) {
    case 0:
      return "Goalkeeper";
    case 1:
      return "Defender";
    case 2:
      return "Midfielder";
    case 3:
      return "Attacker";
    default:
      return null;
  }
}

export class FotmobProvider {
  readonly id = "fotmob" as const;

  private async request<T>(path: string): Promise<ProviderResult<T>> {
    try {
      const response = await fetch(`${BASE}${path}`, { headers: HEADERS });
      if (!response.ok) return fail(`fotmob ${response.status} on ${path}`);
      return ok((await response.json()) as T);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }

  /** Finds the FotMob match id for a fixture from its kickoff date and club names. */
  async findMatchId(
    kickoffISO: string,
    homeName: string,
    awayName: string,
  ): Promise<string | null> {
    const date = kickoffISO.slice(0, 10).replace(/-/g, "");
    const result = await this.request<{
      leagues?: Array<{ matches?: Array<Record<string, unknown>> }>;
    }>(`/matches?date=${date}`);
    if (!result.ok) return null;

    for (const league of result.data.leagues ?? []) {
      for (const match of league.matches ?? []) {
        const home = match["home"] as { name?: string; longName?: string } | undefined;
        const away = match["away"] as { name?: string; longName?: string } | undefined;
        const id = match["id"];
        if (!id || !home || !away) continue;
        const homeOk =
          namesMatch(home.longName ?? home.name ?? "", homeName) ||
          namesMatch(home.name ?? "", homeName);
        const awayOk =
          namesMatch(away.longName ?? away.name ?? "", awayName) ||
          namesMatch(away.name ?? "", awayName);
        if (homeOk && awayOk) return String(id);
      }
    }
    return null;
  }

  /** Confirmed team sheet (starting XI + bench + coach) plus live status. */
  async getMatchSheet(providerMatchId: string): Promise<ProviderResult<MatchSheet>> {
    const result = await this.request<{
      header?: {
        status?: { started?: boolean; finished?: boolean; cancelled?: boolean; halfs?: unknown };
      };
      content?: { lineup?: { homeTeam?: FotmobSide; awayTeam?: FotmobSide } | null };
    }>(`/matchDetails?matchId=${providerMatchId}`);
    if (!result.ok) return result;

    const lineup = result.data.content?.lineup;
    if (!lineup?.homeTeam || !lineup.awayTeam) {
      return fail("fotmob has not published the team sheet yet");
    }

    const map = (list: FotmobPlayer[] | undefined): MatchSheetPlayer[] =>
      (list ?? [])
        .filter((player) => player.id && player.name)
        .map((player) => ({
          providerId: String(player.id),
          name: String(player.name),
          position: positionFromRole(player.usualPlayingPositionId),
          shirtNumber:
            player.shirtNumber === null || player.shirtNumber === undefined
              ? null
              : Number(player.shirtNumber) || null,
        }));

    const side = (raw: FotmobSide): MatchSheetSide => ({
      formation: raw.formation ?? null,
      coachProviderId: raw.coach?.id ? String(raw.coach.id) : null,
      coachName: raw.coach?.name ?? null,
      lineup: map(raw.starters),
      bench: map(raw.subs),
    });

    const flags = result.data.header?.status;
    const status: MatchStatus = flags?.cancelled
      ? "CANCELLED"
      : flags?.finished
        ? "FINISHED"
        : flags?.started
          ? "LIVE"
          : "SCHEDULED";

    return ok({ status, home: side(lineup.homeTeam), away: side(lineup.awayTeam) });
  }

  /** Live status + score for one fixture, used to unstick stale provider statuses. */
  async getLiveStatus(providerMatchId: string): Promise<
    ProviderResult<{ status: MatchStatus; homeScore: number | null; awayScore: number | null; minute: number | null }>
  > {
    const result = await this.request<{
      general?: { started?: boolean; finished?: boolean };
      header?: {
        status?: {
          started?: boolean;
          finished?: boolean;
          cancelled?: boolean;
          liveTime?: { short?: string } | null;
          scoreStr?: string | null;
        };
      };
    }>(`/matchDetails?matchId=${providerMatchId}`);
    if (!result.ok) return result;

    const s = result.data.header?.status;
    const status: MatchStatus = s?.cancelled
      ? "CANCELLED"
      : s?.finished
        ? "FINISHED"
        : s?.started
          ? "LIVE"
          : "SCHEDULED";
    const parts = (s?.scoreStr ?? "").split("-").map((value) => Number(value.trim()));
    const minute = Number((s?.liveTime?.short ?? "").replace(/\D/g, "")) || null;

    return ok({
      status,
      homeScore: Number.isFinite(parts[0]) ? (parts[0] as number) : null,
      awayScore: Number.isFinite(parts[1]) ? (parts[1] as number) : null,
      minute,
    });
  }
}
