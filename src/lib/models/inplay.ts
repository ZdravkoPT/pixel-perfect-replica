/**
 * In-play model.
 *
 * Takes the pre-match goal rates the Dixon-Coles model produced, the current
 * score, the minute on the clock and the red cards shown, and returns the
 * probabilities for the *rest* of the match combined with what has already
 * happened. Nothing here is fitted — it is the same Poisson process restricted
 * to the remaining time, with a published-style red-card penalty.
 */

const FULL_TIME = 90;
/** A team a man down scores ~25% less and concedes ~30% more per remaining minute. */
const RED_ATTACK = 0.75;
const RED_DEFENCE = 1.3;
const MAX_GOALS = 10;

export interface InPlayState {
  minute: number;
  homeScore: number;
  awayScore: number;
  homeRed: number;
  awayRed: number;
}

export interface InPlayMarkets {
  home: number;
  draw: number;
  away: number;
  over05: number;
  over15: number;
  over25: number;
  over35: number;
  under25: number;
  btts: number;
  noBtts: number;
  remainingHome: number;
  remainingAway: number;
  topScoreline: { home: number; away: number };
}

function poisson(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) p = (p * lambda) / i;
  return p;
}

/** Combines the goals already scored with a Poisson process over the minutes left. */
export function inPlayMarkets(
  lambdaHome: number,
  lambdaAway: number,
  state: InPlayState,
): InPlayMarkets {
  const minute = Math.min(Math.max(state.minute, 0), FULL_TIME);
  const remaining = Math.max(0, (FULL_TIME - minute) / FULL_TIME);

  const redDiff = state.awayRed - state.homeRed;
  const homeMult =
    Math.pow(RED_ATTACK, state.homeRed) * Math.pow(RED_DEFENCE, Math.max(0, redDiff));
  const awayMult =
    Math.pow(RED_ATTACK, state.awayRed) * Math.pow(RED_DEFENCE, Math.max(0, -redDiff));

  const restHome = lambdaHome * remaining * homeMult;
  const restAway = lambdaAway * remaining * awayMult;

  let home = 0;
  let draw = 0;
  let away = 0;
  const totals = new Array<number>(MAX_GOALS * 2 + 1).fill(0);
  let bttsProb = 0;
  let top = { home: state.homeScore, away: state.awayScore };
  let topProb = -1;

  for (let h = 0; h <= MAX_GOALS; h += 1) {
    const ph = poisson(restHome, h);
    for (let a = 0; a <= MAX_GOALS; a += 1) {
      const p = ph * poisson(restAway, a);
      if (p <= 0) continue;
      const fh = state.homeScore + h;
      const fa = state.awayScore + a;
      if (fh > fa) home += p;
      else if (fh === fa) draw += p;
      else away += p;
      const total = Math.min(fh + fa, totals.length - 1);
      totals[total] = (totals[total] ?? 0) + p;
      if (fh > 0 && fa > 0) bttsProb += p;
      if (p > topProb) {
        topProb = p;
        top = { home: fh, away: fa };
      }
    }
  }

  const over = (line: number) =>
    totals.reduce((sum, value, goals) => (goals > line ? sum + value : sum), 0);

  const norm = home + draw + away || 1;
  return {
    home: home / norm,
    draw: draw / norm,
    away: away / norm,
    over05: over(0.5),
    over15: over(1.5),
    over25: over(2.5),
    over35: over(3.5),
    under25: 1 - over(2.5),
    btts: bttsProb,
    noBtts: 1 - bttsProb,
    remainingHome: restHome,
    remainingAway: restAway,
    topScoreline: top,
  };
}
