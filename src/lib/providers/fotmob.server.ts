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

  /**
   * Everything the in-play model needs from one request: status, score, clock,
   * red cards per side and the substitutions made so far.
   */
  async getInPlay(providerMatchId: string): Promise<ProviderResult<InPlayFeed>> {
    const result = await this.request<Record<string, any>>(
      `/matchDetails?matchId=${providerMatchId}`,
    );
    if (!result.ok) return result;

    const s = (result.data["header"] ?? {})["status"] ?? {};
    const status: MatchStatus = s.cancelled
      ? "CANCELLED"
      : s.finished
        ? "FINISHED"
        : s.started
          ? "LIVE"
          : "SCHEDULED";
    const parts = String(s.scoreStr ?? "")
      .split("-")
      .map((value: string) => Number(value.trim()));
    const minute = Number(String(s.liveTime?.short ?? "").replace(/\D/g, "")) || null;

    const events = ((result.data["content"] ?? {})["matchFacts"] ?? {})["events"]?.["events"] ?? [];
    let homeRed = 0;
    let awayRed = 0;
    const substitutions: InPlayFeed["substitutions"] = [];

    for (const event of events as any[]) {
      const isHome = event?.isHome === true;
      const card = String(event?.card ?? "").toLowerCase();
      const type = String(event?.type ?? "").toLowerCase();
      if (card.includes("red")) {
        if (isHome) homeRed += 1;
        else awayRed += 1;
      }
      if (type.includes("substitution")) {
        substitutions.push({
          minute: typeof event?.time === "number" ? event.time : null,
          side: isHome ? "home" : "away",
          off: event?.swap?.[0]?.name ?? event?.player?.name ?? null,
          on: event?.swap?.[1]?.name ?? event?.nameStr ?? null,
        });
      }
    }

    return ok({
      status,
      homeScore: Number.isFinite(parts[0]) ? (parts[0] as number) : null,
      awayScore: Number.isFinite(parts[1]) ? (parts[1] as number) : null,
      minute,
      homeRed,
      awayRed,
      substitutions,
    });
  }

  /**
   * Season-by-season record, club history and national-team caps for one
   * player. All of it comes from FotMob's free player endpoint.
   */
  async getPlayerCareer(providerPlayerId: string): Promise<ProviderResult<PlayerCareer>> {
    const result = await this.request<Record<string, any>>(`/playerData?id=${providerPlayerId}`);
    if (!result.ok) return result;
    const data = result.data;

    const info: Record<string, string> = {};
    for (const item of (data["playerInformation"] ?? []) as any[]) {
      const title = String(item?.title ?? "");
      const value = item?.value?.fallback ?? item?.value?.numberValue;
      if (title && value !== undefined && value !== null && typeof value !== "object") {
        info[title] = String(value);
      }
    }

    const num = (value: unknown): number | null => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const main = data["mainLeague"] ?? null;
    const mainStats: Record<string, number> = {};
    for (const stat of (main?.stats ?? []) as any[]) {
      const key = String(stat?.localizedTitleId ?? "");
      if (key && typeof stat?.value === "number") mainStats[key] = stat.value;
    }

    const seasons: PlayerCareer["seasons"] = [];
    for (const entry of (data["careerHistory"]?.careerItems?.senior?.seasonEntries ?? []) as any[]) {
      seasons.push({
        season: String(entry?.seasonName ?? ""),
        team: entry?.team ? String(entry.team) : null,
        appearances: num(entry?.appearances) ?? 0,
        goals: num(entry?.goals) ?? 0,
        assists: num(entry?.assists) ?? 0,
        rating: num(entry?.rating?.rating),
        competitions: ((entry?.tournamentStats ?? []) as any[]).map((t) => ({
          name: String(t?.leagueName ?? ""),
          appearances: num(t?.appearances) ?? 0,
          goals: num(t?.goals) ?? 0,
          assists: num(t?.assists) ?? 0,
          rating: num(t?.rating?.rating),
        })),
      });
    }

    const clubs: PlayerCareer["clubs"] = [];
    for (const entry of (data["careerHistory"]?.careerItems?.senior?.teamEntries ?? []) as any[]) {
      clubs.push({
        team: String(entry?.team ?? ""),
        from: entry?.startDate ? String(entry.startDate).slice(0, 10) : null,
        to: entry?.endDate ? String(entry.endDate).slice(0, 10) : null,
        active: Boolean(entry?.active),
        appearances: num(entry?.appearances) ?? 0,
        goals: num(entry?.goals) ?? 0,
        assists: num(entry?.assists) ?? 0,
      });
    }

    const national: PlayerCareer["national"] = [];
    for (const entry of (data["careerHistory"]?.careerItems?.["national team"]?.teamEntries ??
      []) as any[]) {
      national.push({
        team: String(entry?.team ?? ""),
        from: entry?.startDate ? String(entry.startDate).slice(0, 10) : null,
        to: entry?.endDate ? String(entry.endDate).slice(0, 10) : null,
        active: Boolean(entry?.active),
        caps: num(entry?.appearances) ?? 0,
        goals: num(entry?.goals) ?? 0,
      });
    }

    const injury = data["injuryInformation"];

    return ok({
      name: data["name"] ? String(data["name"]) : null,
      country: info["Country"] ?? null,
      height: info["Height"] ?? null,
      preferredFoot: info["Preferred foot"] ?? null,
      shirt: info["Shirt"] ?? null,
      contractEnd: info["Contract end"] ?? null,
      marketValueLabel: info["Market value"] ?? null,
      positionDescription: data["positionDescription"]?.primaryPosition?.label ?? null,
      currentSeason: main
        ? {
            league: String(main.leagueName ?? ""),
            season: String(main.season ?? ""),
            matches: mainStats["matches_uppercase"] ?? null,
            started: mainStats["started"] ?? null,
            minutes: mainStats["minutes_played"] ?? null,
            goals: mainStats["goals"] ?? null,
            assists: mainStats["assists"] ?? null,
            rating: mainStats["rating"] ?? null,
            yellowCards: mainStats["yellow_cards"] ?? null,
            redCards: mainStats["red_cards"] ?? null,
          }
        : null,
      seasons,
      clubs,
      national,
      injury: injury ? JSON.stringify(injury).slice(0, 400) : null,
    });
  }

  /**
   * Rich match facts: referee/stadium info, team form, head-to-head summary,
   * live match stats and the timeline of goals, cards and substitutions.
   */
  async getMatchFacts(providerMatchId: string): Promise<ProviderResult<MatchFacts>> {
    const result = await this.request<Record<string, any>>(
      `/matchDetails?matchId=${providerMatchId}`,
    );
    if (!result.ok) return result;

    const content = (result.data["content"] ?? {}) as Record<string, any>;
    const matchFacts = (content["matchFacts"] ?? {}) as Record<string, any>;
    const infoBox = (matchFacts["infoBox"] ?? {}) as Record<string, any>;

    const info: Array<{ label: string; value: string }> = [];
    const pushInfo = (label: string, value: unknown) => {
      if (typeof value === "string" && value.trim()) info.push({ label, value: value.trim() });
    };
    pushInfo("Referee", infoBox["Referee"]?.text ?? infoBox["Referee"]?.name);
    pushInfo("Stadium", infoBox["Stadium"]?.name ?? infoBox["Stadium"]?.text);
    pushInfo("Attendance", infoBox["Attendance"] ? String(infoBox["Attendance"]) : undefined);
    pushInfo("Tournament", infoBox["Tournament"]?.text ?? infoBox["Tournament"]?.leagueName);
    pushInfo("Kick off", infoBox["Match Date"]?.utcTime);

    const statGroups: MatchFacts["statGroups"] = [];
    const periods = (content["stats"] ?? {})["Periods"] ?? {};
    const all = periods["All"] ?? {};
    for (const group of (all["stats"] ?? []) as any[]) {
      const items: Array<{ title: string; home: string; away: string }> = [];
      for (const stat of (group?.stats ?? []) as any[]) {
        const values = stat?.stats ?? stat?.value;
        if (!Array.isArray(values) || values.length < 2) continue;
        items.push({
          title: String(stat?.title ?? ""),
          home: String(values[0] ?? ""),
          away: String(values[1] ?? ""),
        });
      }
      if (items.length > 0) statGroups.push({ title: String(group?.title ?? "Stats"), items });
    }

    const events: MatchFacts["events"] = [];
    for (const event of ((matchFacts["events"] ?? {})["events"] ?? []) as any[]) {
      const type = String(event?.type ?? "");
      if (!type) continue;
      events.push({
        minute: typeof event?.time === "number" ? event.time : null,
        type,
        team: event?.isHome === true ? "home" : event?.isHome === false ? "away" : null,
        player: event?.player?.name ?? event?.nameStr ?? null,
        detail:
          event?.swap?.[0]?.name ??
          event?.assistStr ??
          (typeof event?.card === "string" ? event.card : null),
      });
    }

    const form: MatchFacts["form"] = [];
    for (const side of (matchFacts["teamForm"] ?? []) as any[]) {
      const results: string[] = [];
      for (const entry of (side ?? []) as any[]) {
        const outcome = String(entry?.resultString ?? entry?.result ?? "").trim();
        if (outcome) results.push(outcome);
      }
      form.push(results);
    }

    const h2h: MatchFacts["h2h"] = [];
    for (const match of ((content["h2h"] ?? {})["matches"] ?? []) as any[]) {
      h2h.push({
        date: String(match?.status?.utcTime ?? match?.time ?? ""),
        home: String(match?.home?.name ?? ""),
        away: String(match?.away?.name ?? ""),
        score: String(match?.status?.scoreStr ?? ""),
        league: String(match?.league?.name ?? match?.tournament?.name ?? ""),
      });
    }

    return ok({ info, statGroups, events, form, h2h });
  }

  /** Resolves a FotMob team id from a club name (free search endpoint). */
  async findTeamId(name: string): Promise<string | null> {
    const result = await this.request<
      Array<{ suggestions?: Array<{ type?: string; id?: string; name?: string }> }>
    >(`/search/suggest?term=${encodeURIComponent(name)}&lang=en`);
    if (!result.ok) return null;

    for (const group of result.data ?? []) {
      for (const suggestion of group.suggestions ?? []) {
        if (suggestion.type !== "team" || !suggestion.id || !suggestion.name) continue;
        if (/\(W\)|women/i.test(suggestion.name)) continue;
        if (namesMatch(suggestion.name, name, 0.72)) return String(suggestion.id);
      }
    }
    return null;
  }

  /**
   * Squad with season form: rating, goals, assists, cards, injury flag, market
   * value, age. Used as the baseline for each player's skill profile.
   */
  async getSquad(teamId: string): Promise<ProviderResult<SquadMember[]>> {
    const result = await this.request<{
      squad?: { squad?: Array<{ title?: string; members?: RawSquadMember[] }> };
    }>(`/teams?id=${teamId}&tab=squad`);
    if (!result.ok) return result;

    const members: SquadMember[] = [];
    for (const group of result.data.squad?.squad ?? []) {
      if (group.title === "coach") continue;
      for (const member of group.members ?? []) {
        if (!member.id || !member.name) continue;
        members.push({
          providerId: String(member.id),
          name: String(member.name),
          positionGroup: group.title ?? null,
          shirtNumber: member.shirtNumber ?? null,
          age: member.age ?? null,
          rating: member.rating ?? null,
          goals: member.goals ?? 0,
          assists: member.assists ?? 0,
          yellowCards: member.ycards ?? 0,
          redCards: member.rcards ?? 0,
          injured: Boolean(member.injured),
          marketValue: member.transferValue ?? null,
        });
      }
    }
    return ok(members);
  }

  /**
   * Percentile skill profile for one player, compared with peers in the same
   * position. Values are 0..1 percentiles published by FotMob.
   */
  async getPlayerTraits(providerPlayerId: string): Promise<
    ProviderResult<{ items: Array<{ key: string; title: string; value: number }>; minutes: number | null }>
  > {
    const result = await this.request<{
      traits?: { items?: Array<{ key?: string; title?: string; value?: number }> };
      mainLeague?: { stats?: Array<{ localizedTitleId?: string; value?: number }> };
    }>(`/playerData?id=${providerPlayerId}`);
    if (!result.ok) return result;

    const items = (result.data.traits?.items ?? [])
      .filter((item) => item.key && typeof item.value === "number")
      .map((item) => ({
        key: String(item.key),
        title: item.title ?? String(item.key),
        value: Number(item.value),
      }));

    const minutesStat = (result.data.mainLeague?.stats ?? []).find((stat) =>
      String(stat.localizedTitleId ?? "").startsWith("minutes"),
    );

    return ok({ items, minutes: typeof minutesStat?.value === "number" ? minutesStat.value : null });
  }

  /** FotMob id of the head coach currently listed in a club's squad. */
  async findTeamCoach(
    teamId: string,
  ): Promise<{ providerId: string; name: string; nationality: string | null; birthDate: string | null } | null> {
    const result = await this.request<{
      squad?: {
        squad?: Array<{
          title?: string;
          members?: Array<{
            id?: number;
            name?: string;
            cname?: string | null;
            dateOfBirth?: string | null;
          }>;
        }>;
      };
    }>(`/teams?id=${teamId}&tab=squad`);
    if (!result.ok) return null;

    const group = (result.data.squad?.squad ?? []).find((entry) => entry.title === "coach");
    const member = group?.members?.[0];
    if (!member?.id || !member.name) return null;
    return {
      providerId: String(member.id),
      name: String(member.name),
      nationality: member.cname ?? null,
      birthDate: member.dateOfBirth ? String(member.dateOfBirth).slice(0, 10) : null,
    };
  }

  /**
   * Full coach dossier: managerial spells (including assistant-coach roles),
   * the playing career that came before them, per-club records and the trophy
   * list FotMob publishes for free.
   */
  async getCoachProfile(providerCoachId: string): Promise<ProviderResult<CoachProfile>> {
    const result = await this.request<Record<string, any>>(`/playerData?id=${providerCoachId}`);
    if (!result.ok) return result;
    const data = result.data;

    const info: Record<string, string> = {};
    for (const item of (data["playerInformation"] ?? []) as any[]) {
      const title = String(item?.title ?? "");
      const value = item?.value?.fallback;
      if (title && typeof value === "string") info[title] = value;
    }

    const spell = (entry: any, kind: "coach" | "player"): CoachSpellEntry => ({
      kind,
      team: String(entry?.team ?? ""),
      teamProviderId: entry?.teamId ? String(entry.teamId) : null,
      role: entry?.role?.text ? String(entry.role.text) : kind === "coach" ? "head coach" : "player",
      from: entry?.startDate ? String(entry.startDate).slice(0, 10) : null,
      to: entry?.endDate ? String(entry.endDate).slice(0, 10) : null,
      active: Boolean(entry?.active),
      appearances: entry?.appearances ? String(entry.appearances) : null,
      goals: entry?.goals ? String(entry.goals) : null,
    });

    const items = data["careerHistory"]?.careerItems ?? {};
    const career: CoachSpellEntry[] = [
      ...((items?.coach?.teamEntries ?? []) as any[]).map((entry) => spell(entry, "coach")),
      ...((items?.senior?.teamEntries ?? []) as any[]).map((entry) => spell(entry, "player")),
    ];

    const seasons: CoachClubRecord[] = (
      (data["coachStats"]?.historicalCareerEntries ?? []) as any[]
    ).map((entry) => ({
      team: String(entry?.teamName ?? ""),
      teamProviderId: entry?.teamId ? String(entry.teamId) : null,
      from: entry?.startDate?.utcTime ? String(entry.startDate.utcTime).slice(0, 10) : null,
      to: entry?.endDate?.utcTime ? String(entry.endDate.utcTime).slice(0, 10) : null,
      matches: Number(entry?.matches ?? 0),
      wins: Number(entry?.wins ?? 0),
      draws: Number(entry?.draws ?? 0),
      losses: Number(entry?.losses ?? 0),
      winPercentage: Number.isFinite(Number(entry?.winPercentage))
        ? Number(entry.winPercentage)
        : null,
      pointsPerGame: Number.isFinite(Number(entry?.pointsPerGame))
        ? Number(entry.pointsPerGame)
        : null,
    }));

    const achievements: CoachAchievement[] = [];
    for (const club of (data["trophies"]?.playerTrophies ?? []) as any[]) {
      for (const tournament of (club?.tournaments ?? []) as any[]) {
        achievements.push({
          team: String(club?.teamName ?? ""),
          competition: String(tournament?.leagueName ?? ""),
          won: ((tournament?.seasonsWon ?? []) as any[]).map(String),
          runnerUp: ((tournament?.seasonsRunnerUp ?? []) as any[]).map(String),
        });
      }
    }

    const active = data["coachStats"]?.activeCareerEntry ?? null;
    const totals = seasons.reduce(
      (acc, row) => ({
        matches: acc.matches + row.matches,
        wins: acc.wins + row.wins,
        draws: acc.draws + row.draws,
        losses: acc.losses + row.losses,
      }),
      { matches: 0, wins: 0, draws: 0, losses: 0 },
    );

    return ok({
      name: data["name"] ? String(data["name"]) : null,
      nationality: info["Country"] ?? null,
      currentTeam: active?.teamName ? String(active.teamName) : null,
      currentTeamProviderId: active?.teamId ? String(active.teamId) : null,
      career,
      seasons,
      achievements,
      totals,
    });
  }

  /** Recent appearances for one player — the basis of the condition panel. */
  async getPlayerRecentMatches(
    providerPlayerId: string,
  ): Promise<ProviderResult<{ matches: RecentAppearance[]; injury: unknown }>> {
    const result = await this.request<Record<string, any>>(`/playerData?id=${providerPlayerId}`);
    if (!result.ok) return result;

    const matches: RecentAppearance[] = ((result.data["recentMatches"] ?? []) as any[])
      .filter((row) => row?.matchDate?.utcTime)
      .map((row) => ({
        matchId: row?.id ? String(row.id) : null,
        date: String(row.matchDate.utcTime),
        teamProviderId: row?.teamId ? String(row.teamId) : null,
        team: row?.teamName ? String(row.teamName) : null,
        opponent: row?.opponentTeamName ? String(row.opponentTeamName) : null,
        league: row?.leagueName ? String(row.leagueName) : null,
        minutes: Number(row?.minutesPlayed ?? 0),
        started: Boolean(row?.playedInMatch) && !row?.onBench,
        played: Boolean(row?.playedInMatch),
        goals: Number(row?.goals ?? 0),
        assists: Number(row?.assists ?? 0),
        rating: Number.isFinite(Number(row?.ratingProps?.rating))
          ? Number(row.ratingProps.rating)
          : null,
      }));

    return ok({ matches, injury: result.data["injuryInformation"] ?? null });
  }
}

export interface CoachSpellEntry {
  kind: "coach" | "player";
  team: string;
  teamProviderId: string | null;
  role: string;
  from: string | null;
  to: string | null;
  active: boolean;
  appearances: string | null;
  goals: string | null;
}

export interface CoachClubRecord {
  team: string;
  teamProviderId: string | null;
  from: string | null;
  to: string | null;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winPercentage: number | null;
  pointsPerGame: number | null;
}

export interface CoachAchievement {
  team: string;
  competition: string;
  won: string[];
  runnerUp: string[];
}

export interface CoachProfile {
  name: string | null;
  nationality: string | null;
  currentTeam: string | null;
  currentTeamProviderId: string | null;
  career: CoachSpellEntry[];
  seasons: CoachClubRecord[];
  achievements: CoachAchievement[];
  totals: { matches: number; wins: number; draws: number; losses: number };
}

export interface RecentAppearance {
  matchId: string | null;
  date: string;
  teamProviderId: string | null;
  team: string | null;
  opponent: string | null;
  league: string | null;
  minutes: number;
  started: boolean;
  played: boolean;
  goals: number;
  assists: number;
  rating: number | null;
}


interface RawSquadMember {
  id?: number;
  name?: string;
  shirtNumber?: number | null;
  age?: number | null;
  rating?: number | null;
  goals?: number | null;
  assists?: number | null;
  ycards?: number | null;
  rcards?: number | null;
  injured?: boolean;
  transferValue?: number | null;
}

export interface SquadMember {
  providerId: string;
  name: string;
  positionGroup: string | null;
  shirtNumber: number | null;
  age: number | null;
  rating: number | null;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  injured: boolean;
  marketValue: number | null;
}

export interface MatchFacts {
  info: Array<{ label: string; value: string }>;
  statGroups: Array<{ title: string; items: Array<{ title: string; home: string; away: string }> }>;
  events: Array<{
    minute: number | null;
    type: string;
    team: "home" | "away" | null;
    player: string | null;
    detail: string | null;
  }>;
  form: string[][];
  h2h: Array<{ date: string; home: string; away: string; score: string; league: string }>;
}

export interface InPlayFeed {
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  homeRed: number;
  awayRed: number;
  substitutions: Array<{
    minute: number | null;
    side: "home" | "away";
    off: string | null;
    on: string | null;
  }>;
}

export interface PlayerCareer {
  name: string | null;
  country: string | null;
  height: string | null;
  preferredFoot: string | null;
  shirt: string | null;
  contractEnd: string | null;
  marketValueLabel: string | null;
  positionDescription: string | null;
  currentSeason: {
    league: string;
    season: string;
    matches: number | null;
    started: number | null;
    minutes: number | null;
    goals: number | null;
    assists: number | null;
    rating: number | null;
    yellowCards: number | null;
    redCards: number | null;
  } | null;
  seasons: Array<{
    season: string;
    team: string | null;
    appearances: number;
    goals: number;
    assists: number;
    rating: number | null;
    competitions: Array<{
      name: string;
      appearances: number;
      goals: number;
      assists: number;
      rating: number | null;
    }>;
  }>;
  clubs: Array<{
    team: string;
    from: string | null;
    to: string | null;
    active: boolean;
    appearances: number;
    goals: number;
    assists: number;
  }>;
  national: Array<{
    team: string;
    from: string | null;
    to: string | null;
    active: boolean;
    caps: number;
    goals: number;
  }>;
  injury: string | null;
}
