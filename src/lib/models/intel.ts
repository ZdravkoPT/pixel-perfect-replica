/**
 * Phase 3 intelligence models — pure TypeScript, no I/O.
 *
 * Minutes, predicted line-ups, corner/card markets and player props are all
 * derived from squad structure plus the team-level Poisson/Dixon-Coles goal
 * rates produced in Phase 2. Every output is explicitly probabilistic and
 * carries the sample basis it was built from, so the UI can label estimates
 * that are model-derived rather than observed.
 */

import { fairOdds, poissonPmf } from "./poisson";

export type PositionGroup = "GK" | "DEF" | "MID" | "FWD";

/** Maps provider position strings (football-data + api-football) to a group. */
export function positionGroup(position: string | null | undefined): PositionGroup {
  const value = (position ?? "").toLowerCase();
  if (!value) return "MID";
  if (value.includes("keeper") || value === "g" || value === "gk") return "GK";
  if (
    value.includes("back") ||
    value.includes("defen") ||
    value === "d" ||
    value.includes("wing-back")
  ) {
    return "DEF";
  }
  if (value.includes("forward") || value.includes("striker") || value.includes("offen") || value === "f") {
    return "FWD";
  }
  if (value.includes("winger")) return "FWD";
  return "MID";
}

/** Target shape of a 4-3-3 starting eleven. */
export const FORMATION = { GK: 1, DEF: 4, MID: 3, FWD: 3 } as const;
export const FORMATION_LABEL = "4-3-3";

export interface SquadCandidate {
  playerId: string;
  name: string;
  position: string | null;
  shirtNumber: number | null;
  /** Observed minutes in recent matches, when player stats are available. */
  recentMinutes?: number | null;
  /** Number of recent matches the player appeared in. */
  recentAppearances?: number | null;
  available: boolean;
}

export interface ProjectedPlayer {
  playerId: string;
  name: string;
  group: PositionGroup;
  isStarter: boolean;
  startProbability: number;
  expectedMinutes: number;
}

/**
 * Rank a squad into a projected eleven plus bench.
 *
 * Ranking uses observed recent minutes when we have them; otherwise it falls
 * back to squad seniority signals (low shirt numbers are typically first-team
 * regulars). Unavailable players (injury/suspension) are pushed to the back.
 */
export function projectLineup(candidates: SquadCandidate[]): ProjectedPlayer[] {
  const groups: Record<PositionGroup, SquadCandidate[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const candidate of candidates) groups[positionGroup(candidate.position)].push(candidate);

  const output: ProjectedPlayer[] = [];

  for (const group of Object.keys(groups) as PositionGroup[]) {
    const ranked = [...(groups[group] ?? [])].sort((a, b) => score(b) - score(a));
    const slots = FORMATION[group];

    ranked.forEach((candidate, index) => {
      const isStarter = candidate.available && index < slots;
      const depthPenalty = Math.max(0, index - slots + 1);
      const startProbability = candidate.available
        ? isStarter
          ? clamp(0.86 - index * 0.05, 0.5, 0.92)
          : clamp(0.3 / (1 + depthPenalty), 0.02, 0.3)
        : 0.01;
      const expectedMinutes = clamp(
        startProbability * 82 + (candidate.available ? (1 - startProbability) * 12 : 0),
        0,
        90,
      );

      output.push({
        playerId: candidate.playerId,
        name: candidate.name,
        group,
        isStarter,
        startProbability: round(startProbability),
        expectedMinutes: round(expectedMinutes),
      });
    });
  }

  return output.sort((a, b) => b.expectedMinutes - a.expectedMinutes);
}

function score(candidate: SquadCandidate): number {
  if (!candidate.available) return -1000;
  const minutes = candidate.recentMinutes ?? null;
  if (minutes !== null) return minutes;
  const shirt = candidate.shirtNumber ?? 40;
  return 100 - Math.min(shirt, 60);
}

/* ------------------------------------------------------------------ */
/* Corner and card markets                                             */
/* ------------------------------------------------------------------ */

/** League-average baselines used when observed match statistics are absent. */
export const BASELINES = {
  cornersPerMatch: 10.2,
  cardsPerMatch: 3.9,
  goalsPerMatch: 2.72,
  homeCornerShare: 0.55,
} as const;

export interface TeamMarketInput {
  lambdaHome: number;
  lambdaAway: number;
  /** Referee yellow cards per game, when a profile exists. */
  refereeCardsPerGame?: number | null;
}

export interface DerivedMarket {
  market: string;
  selection: string;
  line: number | null;
  probability: number;
  fairOdds: number;
}

/** Corners scale with attacking volume, cards with referee strictness. */
export function derivedTeamMarkets(input: TeamMarketInput): {
  expectedCorners: number;
  expectedCards: number;
  markets: DerivedMarket[];
} {
  const totalGoals = input.lambdaHome + input.lambdaAway;
  const attackFactor = clamp(totalGoals / BASELINES.goalsPerMatch, 0.7, 1.4);
  const expectedCorners = round(BASELINES.cornersPerMatch * attackFactor);

  const refereeFactor =
    input.refereeCardsPerGame && input.refereeCardsPerGame > 0
      ? clamp(input.refereeCardsPerGame / BASELINES.cardsPerMatch, 0.6, 1.6)
      : 1;
  const expectedCards = round(BASELINES.cardsPerMatch * refereeFactor);

  const markets: DerivedMarket[] = [];
  for (const line of [8.5, 9.5, 10.5, 11.5]) {
    const over = poissonOver(line, expectedCorners);
    markets.push(market("corners", `over_${line}`, line, over));
    markets.push(market("corners", `under_${line}`, line, 1 - over));
  }
  for (const line of [3.5, 4.5]) {
    const over = poissonOver(line, expectedCards);
    markets.push(market("cards", `over_${line}`, line, over));
    markets.push(market("cards", `under_${line}`, line, 1 - over));
  }

  return { expectedCorners, expectedCards, markets };
}

/* ------------------------------------------------------------------ */
/* Player props                                                        */
/* ------------------------------------------------------------------ */

const GOAL_WEIGHT: Record<PositionGroup, number> = { GK: 0.002, DEF: 0.07, MID: 0.2, FWD: 0.45 };
const ASSIST_WEIGHT: Record<PositionGroup, number> = { GK: 0.005, DEF: 0.12, MID: 0.28, FWD: 0.3 };
const CARD_RATE: Record<PositionGroup, number> = { GK: 0.04, DEF: 0.19, MID: 0.18, FWD: 0.11 };

export interface PropInput {
  players: ProjectedPlayer[];
  /** Expected goals for the player's own team. */
  teamLambda: number;
  /** Expected cards in the match (both teams). */
  expectedCards: number;
}

export interface PlayerProp {
  playerId: string;
  market: string;
  selection: string;
  line: number | null;
  probability: number;
  fairOdds: number;
  expectedMinutes: number;
}

/**
 * Split team goal expectancy across the squad by position weight and expected
 * minutes, then convert each player's rate into anytime-scorer / assist /
 * card probabilities with a Poisson tail.
 */
export function playerProps(input: PropInput): PlayerProp[] {
  const weights = input.players.map(
    (player) => GOAL_WEIGHT[player.group] * (player.expectedMinutes / 90),
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;

  const assistWeights = input.players.map(
    (player) => ASSIST_WEIGHT[player.group] * (player.expectedMinutes / 90),
  );
  const totalAssistWeight = assistWeights.reduce((sum, value) => sum + value, 0) || 1;
  const teamAssists = input.teamLambda * 0.72;

  const props: PlayerProp[] = [];

  input.players.forEach((player, index) => {
    if (player.expectedMinutes < 8) return;

    const goalLambda = (input.teamLambda * (weights[index] ?? 0)) / totalWeight;
    const assistLambda = (teamAssists * (assistWeights[index] ?? 0)) / totalAssistWeight;
    const cardProbability = clamp(
      CARD_RATE[player.group] * (input.expectedCards / BASELINES.cardsPerMatch) *
        (player.expectedMinutes / 90),
      0.01,
      0.7,
    );

    const anytime = 1 - Math.exp(-goalLambda);
    const twoPlus = 1 - Math.exp(-goalLambda) * (1 + goalLambda);
    const assist = 1 - Math.exp(-assistLambda);

    props.push(
      prop(player, "player_goals", "anytime", 0.5, anytime),
      prop(player, "player_goals", "over_1.5", 1.5, twoPlus),
      prop(player, "player_assists", "anytime", 0.5, assist),
      prop(player, "player_cards", "yellow_or_worse", 0.5, cardProbability),
    );
  });

  return props;
}

/* ------------------------------------------------------------------ */

function prop(
  player: ProjectedPlayer,
  market: string,
  selection: string,
  line: number | null,
  probability: number,
): PlayerProp {
  const p = clamp(probability, 0.005, 0.995);
  return {
    playerId: player.playerId,
    market,
    selection,
    line,
    probability: round(p),
    fairOdds: round(fairOdds(p)),
    expectedMinutes: player.expectedMinutes,
  };
}

function market(name: string, selection: string, line: number, probability: number): DerivedMarket {
  const p = clamp(probability, 0.005, 0.995);
  return { market: name, selection, line, probability: round(p), fairOdds: round(fairOdds(p)) };
}

/** P(X > line) for an integer Poisson count with a half-goal line. */
export function poissonOver(line: number, lambda: number): number {
  const threshold = Math.floor(line);
  let cumulative = 0;
  for (let k = 0; k <= threshold; k += 1) cumulative += poissonPmf(k, lambda);
  return clamp(1 - cumulative, 0.005, 0.995);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
