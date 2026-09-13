/**
 * Context layer on top of Dixon-Coles + Elo.
 *
 * The base model carries a single global home advantage, which makes the
 * stronger side look strong *because* it is at home. This module measures the
 * real venue effect from the archive (per league and per team) and adds squad
 * and coaching context, so a superior team playing away is not automatically
 * downgraded and a poor home side is not automatically upgraded.
 *
 * Every factor is a log adjustment to the expected goal rates, shrunk towards
 * zero by sample size and clamped, so a thin sample can never dominate.
 */

export interface VenueMatch {
  leagueId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

export interface VenueFactors {
  /** avg goals globally, home and away side */
  globalHome: number;
  globalAway: number;
  /** per league: log deviation of home / away goal rates from the global rates */
  leagueHome: Record<string, number>;
  leagueAway: Record<string, number>;
  /** per team: how much better/worse the team is at home / away than its own average */
  teamHomeAttack: Record<string, number>;
  teamAwayAttack: Record<string, number>;
  teamHomeDefence: Record<string, number>;
  teamAwayDefence: Record<string, number>;
  samples: number;
}

const LEAGUE_PRIOR = 150; // matches needed before a league factor counts fully
const TEAM_PRIOR = 25; // matches needed before a team venue split counts fully
const LEAGUE_CLAMP = 0.2;
const TEAM_CLAMP = 0.22;

function clamp(value: number, limit: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, -limit), limit);
}

function logRatio(actual: number, expected: number): number {
  if (actual <= 0 || expected <= 0) return 0;
  return Math.log(actual / expected);
}

export function emptyVenueFactors(): VenueFactors {
  return {
    globalHome: 1.4,
    globalAway: 1.15,
    leagueHome: {},
    leagueAway: {},
    teamHomeAttack: {},
    teamAwayAttack: {},
    teamHomeDefence: {},
    teamAwayDefence: {},
    samples: 0,
  };
}

interface Acc {
  n: number;
  gf: number;
  ga: number;
}

function acc(): Acc {
  return { n: 0, gf: 0, ga: 0 };
}

/** Measures league and team venue effects from finished matches. */
export function fitVenueFactors(matches: VenueMatch[]): VenueFactors {
  const factors = emptyVenueFactors();
  if (matches.length === 0) return factors;

  let homeGoals = 0;
  let awayGoals = 0;
  const leagues = new Map<string, { n: number; home: number; away: number }>();
  const home = new Map<string, Acc>();
  const away = new Map<string, Acc>();

  const bump = (map: Map<string, Acc>, id: string, gf: number, ga: number) => {
    const entry = map.get(id) ?? acc();
    entry.n += 1;
    entry.gf += gf;
    entry.ga += ga;
    map.set(id, entry);
  };

  for (const match of matches) {
    homeGoals += match.homeScore;
    awayGoals += match.awayScore;

    if (match.leagueId) {
      const league = leagues.get(match.leagueId) ?? { n: 0, home: 0, away: 0 };
      league.n += 1;
      league.home += match.homeScore;
      league.away += match.awayScore;
      leagues.set(match.leagueId, league);
    }

    bump(home, match.homeTeamId, match.homeScore, match.awayScore);
    bump(away, match.awayTeamId, match.awayScore, match.homeScore);
  }

  const globalHome = homeGoals / matches.length;
  const globalAway = awayGoals / matches.length;
  factors.globalHome = globalHome;
  factors.globalAway = globalAway;
  factors.samples = matches.length;

  for (const [leagueId, league] of leagues) {
    const weight = league.n / (league.n + LEAGUE_PRIOR);
    factors.leagueHome[leagueId] = clamp(
      weight * logRatio(league.home / league.n, globalHome),
      LEAGUE_CLAMP,
    );
    factors.leagueAway[leagueId] = clamp(
      weight * logRatio(league.away / league.n, globalAway),
      LEAGUE_CLAMP,
    );
  }

  // Expected home/away tilt for an average team, used as the baseline each team
  // is compared against: only the *deviation* from it is a team venue effect.
  const mean = (globalHome + globalAway) / 2;
  const homeTilt = logRatio(globalHome, mean);
  const awayTilt = logRatio(globalAway, mean);

  const teamIds = new Set([...home.keys(), ...away.keys()]);
  for (const teamId of teamIds) {
    const h = home.get(teamId) ?? acc();
    const a = away.get(teamId) ?? acc();
    const n = h.n + a.n;
    if (n === 0) continue;

    const overallFor = (h.gf + a.gf) / n;
    const overallAgainst = (h.ga + a.ga) / n;

    if (h.n > 0) {
      const w = h.n / (h.n + TEAM_PRIOR);
      factors.teamHomeAttack[teamId] = clamp(
        w * (logRatio(h.gf / h.n, overallFor) - homeTilt),
        TEAM_CLAMP,
      );
      factors.teamHomeDefence[teamId] = clamp(
        w * (logRatio(h.ga / h.n, overallAgainst) - awayTilt),
        TEAM_CLAMP,
      );
    }
    if (a.n > 0) {
      const w = a.n / (a.n + TEAM_PRIOR);
      factors.teamAwayAttack[teamId] = clamp(
        w * (logRatio(a.gf / a.n, overallFor) - awayTilt),
        TEAM_CLAMP,
      );
      factors.teamAwayDefence[teamId] = clamp(
        w * (logRatio(a.ga / a.n, overallAgainst) - homeTilt),
        TEAM_CLAMP,
      );
    }
  }

  return factors;
}

/* ------------------------------------------------------------------ */
/* Squad / coaching context                                            */
/* ------------------------------------------------------------------ */

export interface SquadContext {
  /** mean of the best profiled players, 0-100, null when coverage is too thin */
  quality: number | null;
  /** how many players of the squad carry an attribute card */
  coverage: number;
  /** experience index 0-1: minutes played and top-club market value */
  experience: number | null;
  /** share of the profiled core currently unavailable (injury / suspension) */
  unavailable: number;
  /** days since the current head coach was appointed, when known */
  coachDays: number | null;
}

export function emptySquadContext(): SquadContext {
  return { quality: null, coverage: 0, experience: null, unavailable: 0, coachDays: null };
}

export interface ContextAdjustment {
  homeLog: number;
  awayLog: number;
  notes: Array<{ feature: string; label: string; value: number; contribution: number }>;
}

const QUALITY_WEIGHT = 0.006; // log-goals per point of squad-quality difference
const QUALITY_CLAMP = 0.14;
const EXPERIENCE_WEIGHT = 0.05;
const NEW_COACH_DAYS = 60;

/**
 * Combines venue, squad quality, experience, availability and coaching change
 * into log adjustments for both goal rates.
 */
export function contextAdjustment(input: {
  leagueId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  venue: VenueFactors;
  homeSquad: SquadContext;
  awaySquad: SquadContext;
}): ContextAdjustment {
  const { venue, leagueId, homeTeamId, awayTeamId, homeSquad, awaySquad } = input;
  const notes: ContextAdjustment["notes"] = [];

  const leagueHome = (leagueId ? venue.leagueHome[leagueId] : 0) ?? 0;
  const leagueAway = (leagueId ? venue.leagueAway[leagueId] : 0) ?? 0;
  const homeVenue = venue.teamHomeAttack[homeTeamId] ?? 0;
  const awayVenue = venue.teamAwayAttack[awayTeamId] ?? 0;
  const homeVenueDef = venue.teamAwayDefence[awayTeamId] ?? 0;
  const awayVenueDef = venue.teamHomeDefence[homeTeamId] ?? 0;

  let homeLog = leagueHome + homeVenue + homeVenueDef * 0.5;
  let awayLog = leagueAway + awayVenue + awayVenueDef * 0.5;

  notes.push({
    feature: "league_home_effect",
    label: "League home-goal effect",
    value: leagueHome - leagueAway,
    contribution: leagueHome - leagueAway,
  });
  notes.push({
    feature: "venue_split",
    label: "Team home / away venue split",
    value: homeVenue - awayVenue,
    contribution: homeVenue - awayVenue,
  });

  // squad quality, discounted by unavailable players
  const homeQuality =
    homeSquad.quality === null ? null : homeSquad.quality * (1 - 0.6 * homeSquad.unavailable);
  const awayQuality =
    awaySquad.quality === null ? null : awaySquad.quality * (1 - 0.6 * awaySquad.unavailable);

  if (homeQuality !== null && awayQuality !== null && homeSquad.coverage >= 8 && awaySquad.coverage >= 8) {
    const diff = homeQuality - awayQuality;
    const reliability = Math.min(1, Math.min(homeSquad.coverage, awaySquad.coverage) / 16);
    const effect = clamp(diff * QUALITY_WEIGHT * reliability, QUALITY_CLAMP);
    homeLog += effect;
    awayLog -= effect;
    notes.push({
      feature: "squad_quality",
      label: "Squad quality (player ratings, availability)",
      value: diff,
      contribution: effect,
    });
  }

  if (homeSquad.experience !== null && awaySquad.experience !== null) {
    const diff = homeSquad.experience - awaySquad.experience;
    const effect = clamp(diff * EXPERIENCE_WEIGHT, 0.06);
    homeLog += effect;
    awayLog -= effect;
    notes.push({
      feature: "squad_experience",
      label: "Big-club minutes & experience",
      value: diff,
      contribution: effect,
    });
  }

  // A brand-new coach makes the recent record less informative: pull that side
  // back towards the average instead of trusting old form.
  for (const [squad, side] of [
    [homeSquad, "home"],
    [awaySquad, "away"],
  ] as const) {
    if (squad.coachDays === null || squad.coachDays > NEW_COACH_DAYS) continue;
    const freshness = 1 - squad.coachDays / NEW_COACH_DAYS;
    const shrink = 0.08 * freshness;
    if (side === "home") homeLog -= shrink * Math.sign(homeLog || 1) * 0.5;
    else awayLog -= shrink * Math.sign(awayLog || 1) * 0.5;
    notes.push({
      feature: `new_coach_${side}`,
      label: `New head coach (${side}) — recent form discounted`,
      value: squad.coachDays,
      contribution: side === "home" ? -shrink : shrink,
    });
  }

  return { homeLog: clamp(homeLog, 0.45), awayLog: clamp(awayLog, 0.45), notes };
}
