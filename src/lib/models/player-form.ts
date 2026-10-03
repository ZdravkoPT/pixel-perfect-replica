/** Player form score (0-100) from the last 5 games actually played. Needs >= 3 games, else null. */
export type FormGame = {
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  shots: number;
  xg: number | null;
};

export type PlayerForm = {
  score: number;
  games: number;
  avgRating: number | null;
  goalsAssists: number;
  avgMinutes: number;
  xg: number | null;
  parts: { rating: number | null; output: number; minutes: number };
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function computePlayerForm(recent: FormGame[]): PlayerForm | null {
  const games = recent.filter((g) => g.minutes > 0).slice(0, 5);
  if (games.length < 3) return null;
  const mins = games.reduce((s, g) => s + g.minutes, 0);
  const rated = games.filter((g) => g.rating !== null);
  const avgRating = rated.length ? rated.reduce((s, g) => s + Number(g.rating), 0) / rated.length : null;
  const ga = games.reduce((s, g) => s + g.goals + g.assists, 0);
  const xgGames = games.filter((g) => g.xg !== null);
  const xg = xgGames.length ? xgGames.reduce((s, g) => s + Number(g.xg), 0) : null;
  // Rating 6.0 -> 0, 8.0 -> 100. Output: (goals+assists + half of xG) per 90, 1.0 -> 100. Minutes: avg/90.
  const ratingPart = avgRating === null ? null : clamp(((avgRating - 6) / 2) * 100);
  const outputPart = clamp((((ga + (xg ?? 0) * 0.5) / mins) * 90) * 100);
  const minutesPart = clamp((mins / games.length / 90) * 100);
  const score =
    ratingPart === null
      ? 0.6 * outputPart + 0.4 * minutesPart
      : 0.55 * ratingPart + 0.25 * outputPart + 0.2 * minutesPart;
  return {
    score: Math.round(score),
    games: games.length,
    avgRating: avgRating === null ? null : Math.round(avgRating * 100) / 100,
    goalsAssists: ga,
    avgMinutes: Math.round(mins / games.length),
    xg: xg === null ? null : Math.round(xg * 100) / 100,
    parts: {
      rating: ratingPart === null ? null : Math.round(ratingPart),
      output: Math.round(outputPart),
      minutes: Math.round(minutesPart),
    },
  };
}
