/**
 * Poisson / Dixon-Coles scoreline maths (TypeScript, no external deps).
 */

export function factorial(n: number): number {
  let acc = 1;
  for (let i = 2; i <= n; i += 1) acc *= i;
  return acc;
}

export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/** Dixon-Coles low-score dependency correction. */
export function dixonColesTau(
  x: number,
  y: number,
  lambdaHome: number,
  lambdaAway: number,
  rho: number,
): number {
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (x === 0 && y === 1) return 1 + lambdaHome * rho;
  if (x === 1 && y === 0) return 1 + lambdaAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

export interface ScorelineMatrix {
  grid: number[][];
  maxGoals: number;
}

export function scorelineMatrix(
  lambdaHome: number,
  lambdaAway: number,
  rho = 0,
  maxGoals = 10,
): ScorelineMatrix {
  const grid: number[][] = [];
  let total = 0;
  for (let x = 0; x <= maxGoals; x += 1) {
    const row: number[] = [];
    for (let y = 0; y <= maxGoals; y += 1) {
      const p =
        poissonPmf(x, lambdaHome) *
        poissonPmf(y, lambdaAway) *
        Math.max(dixonColesTau(x, y, lambdaHome, lambdaAway, rho), 1e-6);
      row.push(p);
      total += p;
    }
    grid.push(row);
  }
  if (total > 0) {
    for (const row of grid) {
      for (let y = 0; y < row.length; y += 1) row[y] = (row[y] ?? 0) / total;
    }
  }
  return { grid, maxGoals };
}

export interface MarketProbabilities {
  home: number;
  draw: number;
  away: number;
  over25: number;
  under25: number;
  btts: number;
  noBtts: number;
  over15: number;
  under15: number;
  over35: number;
  under35: number;
  topScoreline: { home: number; away: number; probability: number };
}

export function marketsFromMatrix(matrix: ScorelineMatrix): MarketProbabilities {
  let home = 0;
  let draw = 0;
  let away = 0;
  let over25 = 0;
  let over15 = 0;
  let over35 = 0;
  let btts = 0;
  let best = { home: 0, away: 0, probability: 0 };

  for (let x = 0; x <= matrix.maxGoals; x += 1) {
    for (let y = 0; y <= matrix.maxGoals; y += 1) {
      const p = matrix.grid[x]?.[y] ?? 0;
      if (x > y) home += p;
      else if (x === y) draw += p;
      else away += p;
      const goals = x + y;
      if (goals > 1.5) over15 += p;
      if (goals > 2.5) over25 += p;
      if (goals > 3.5) over35 += p;
      if (x > 0 && y > 0) btts += p;
      if (p > best.probability) best = { home: x, away: y, probability: p };
    }
  }

  return {
    home,
    draw,
    away,
    over25,
    under25: 1 - over25,
    over15,
    under15: 1 - over15,
    over35,
    under35: 1 - over35,
    btts,
    noBtts: 1 - btts,
    topScoreline: best,
  };
}

export function fairOdds(probability: number): number {
  if (probability <= 0) return 0;
  return Number((1 / probability).toFixed(3));
}

/** Shannon-entropy based confidence: 1 = certain, 0 = coin flip across 1X2. */
export function confidenceScore(p: [number, number, number]): number {
  const maxEntropy = Math.log(3);
  const entropy = -p.reduce((acc, value) => acc + (value > 0 ? value * Math.log(value) : 0), 0);
  return Math.max(0, Math.min(1, 1 - entropy / maxEntropy));
}
