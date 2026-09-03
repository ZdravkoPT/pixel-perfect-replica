/**
 * Dixon-Coles bivariate goal model with exponential time decay.
 * Fitted with gradient ascent on the (Poisson part of the) log-likelihood,
 * plus a 1-D grid search over the low-score correlation parameter rho.
 */

import { dixonColesTau, poissonPmf } from "./poisson";

export interface DcMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  /** Days before the reference date (0 = most recent). */
  ageDays: number;
}

export interface DcParams {
  attack: Record<string, number>;
  defence: Record<string, number>;
  homeAdvantage: number;
  intercept: number;
  rho: number;
  xi: number;
  samples: number;
  logLikelihood: number;
}

export interface DcOptions {
  /** Time-decay factor per day. Half-life ~ ln2 / xi days. */
  xi?: number;
  iterations?: number;
  learningRate?: number;
}

export function fitDixonColes(matches: DcMatch[], options: DcOptions = {}): DcParams {
  const xi = options.xi ?? 0.0035; // half-life ≈ 198 days
  const iterations = options.iterations ?? 400;
  const lr = options.learningRate ?? 0.05;

  const teams = new Set<string>();
  for (const m of matches) {
    teams.add(m.homeTeamId);
    teams.add(m.awayTeamId);
  }
  const teamIds = [...teams];

  const attack: Record<string, number> = {};
  const defence: Record<string, number> = {};
  for (const id of teamIds) {
    attack[id] = 0;
    defence[id] = 0;
  }

  const totalGoals = matches.reduce((acc, m) => acc + m.homeGoals + m.awayGoals, 0);
  let intercept = matches.length > 0 ? Math.log(Math.max(totalGoals / (2 * matches.length), 0.2)) : 0;
  let homeAdvantage = 0.25;

  const weights = matches.map((m) => Math.exp(-xi * m.ageDays));

  for (let iter = 0; iter < iterations; iter += 1) {
    const gAttack: Record<string, number> = {};
    const gDefence: Record<string, number> = {};
    for (const id of teamIds) {
      gAttack[id] = 0;
      gDefence[id] = 0;
    }
    let gHome = 0;
    let gIntercept = 0;

    for (let i = 0; i < matches.length; i += 1) {
      const m = matches[i]!;
      const w = weights[i]!;
      const lh = Math.exp(
        intercept + homeAdvantage + (attack[m.homeTeamId] ?? 0) + (defence[m.awayTeamId] ?? 0),
      );
      const la = Math.exp(intercept + (attack[m.awayTeamId] ?? 0) + (defence[m.homeTeamId] ?? 0));

      const rh = w * (m.homeGoals - lh);
      const ra = w * (m.awayGoals - la);

      gAttack[m.homeTeamId] = (gAttack[m.homeTeamId] ?? 0) + rh;
      gAttack[m.awayTeamId] = (gAttack[m.awayTeamId] ?? 0) + ra;
      gDefence[m.awayTeamId] = (gDefence[m.awayTeamId] ?? 0) + rh;
      gDefence[m.homeTeamId] = (gDefence[m.homeTeamId] ?? 0) + ra;
      gHome += rh;
      gIntercept += rh + ra;
    }

    const norm = Math.max(matches.length, 1);
    for (const id of teamIds) {
      attack[id] = (attack[id] ?? 0) + (lr * (gAttack[id] ?? 0)) / norm;
      defence[id] = (defence[id] ?? 0) + (lr * (gDefence[id] ?? 0)) / norm;
    }
    homeAdvantage += (lr * gHome) / norm;
    intercept += (lr * gIntercept) / norm;

    // identifiability: attack sums to zero, defence sums to zero
    const meanAttack = teamIds.reduce((a, id) => a + (attack[id] ?? 0), 0) / Math.max(teamIds.length, 1);
    const meanDefence =
      teamIds.reduce((a, id) => a + (defence[id] ?? 0), 0) / Math.max(teamIds.length, 1);
    for (const id of teamIds) {
      attack[id] = (attack[id] ?? 0) - meanAttack;
      defence[id] = (defence[id] ?? 0) - meanDefence;
    }
    intercept += meanAttack + meanDefence;
  }

  const lambdas = matches.map((m) => ({
    lh: Math.exp(intercept + homeAdvantage + (attack[m.homeTeamId] ?? 0) + (defence[m.awayTeamId] ?? 0)),
    la: Math.exp(intercept + (attack[m.awayTeamId] ?? 0) + (defence[m.homeTeamId] ?? 0)),
  }));

  const llFor = (rho: number): number => {
    let ll = 0;
    for (let i = 0; i < matches.length; i += 1) {
      const m = matches[i]!;
      const { lh, la } = lambdas[i]!;
      const tau = Math.max(dixonColesTau(m.homeGoals, m.awayGoals, lh, la, rho), 1e-8);
      const p = Math.max(poissonPmf(m.homeGoals, lh) * poissonPmf(m.awayGoals, la) * tau, 1e-12);
      ll += (weights[i] ?? 0) * Math.log(p);
    }
    return ll;
  };

  let rho = 0;
  let bestLl = llFor(0);
  for (let candidate = -0.2; candidate <= 0.2001; candidate += 0.01) {
    const ll = llFor(candidate);
    if (ll > bestLl) {
      bestLl = ll;
      rho = Number(candidate.toFixed(3));
    }
  }

  return {
    attack,
    defence,
    homeAdvantage,
    intercept,
    rho,
    xi,
    samples: matches.length,
    logLikelihood: bestLl,
  };
}

export function expectedGoals(
  params: DcParams,
  homeTeamId: string,
  awayTeamId: string,
): { lambdaHome: number; lambdaAway: number } {
  const lambdaHome = Math.exp(
    params.intercept +
      params.homeAdvantage +
      (params.attack[homeTeamId] ?? 0) +
      (params.defence[awayTeamId] ?? 0),
  );
  const lambdaAway = Math.exp(
    params.intercept + (params.attack[awayTeamId] ?? 0) + (params.defence[homeTeamId] ?? 0),
  );
  return {
    lambdaHome: Math.min(Math.max(lambdaHome, 0.05), 6),
    lambdaAway: Math.min(Math.max(lambdaAway, 0.05), 6),
  };
}
