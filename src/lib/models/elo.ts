/**
 * Elo rating model for football.
 * K = 20, home-field advantage +70, seasonal regression to the mean at 0.75.
 */

export const ELO_CONFIG = {
  k: 20,
  homeAdvantage: 70,
  base: 1500,
  seasonalRegression: 0.75,
  marginMultiplier: true,
} as const;

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export interface EloUpdate {
  home: number;
  away: number;
}

export function updateElo(
  homeRating: number,
  awayRating: number,
  homeGoals: number,
  awayGoals: number,
): EloUpdate {
  const expected = expectedScore(homeRating + ELO_CONFIG.homeAdvantage, awayRating);
  const actual = homeGoals > awayGoals ? 1 : homeGoals === awayGoals ? 0.5 : 0;

  const margin = Math.abs(homeGoals - awayGoals);
  const multiplier = ELO_CONFIG.marginMultiplier ? Math.log(margin + 1) + 1 : 1;
  const delta = ELO_CONFIG.k * multiplier * (actual - expected);

  return { home: homeRating + delta, away: awayRating - delta };
}

export function regressToMean(rating: number): number {
  return ELO_CONFIG.base + (rating - ELO_CONFIG.base) * ELO_CONFIG.seasonalRegression;
}
