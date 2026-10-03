# Remove odds, rebuild the bet builder as one best pick per match

## 1. Remove the odds work
- Delete the odds import and its schedule hook.
- Leave the unused odds table in place but mark it retired (removing it would need a separate approval); nothing in the app reads it.

## 2. New "Match Picks" engine — one pick per match
For every upcoming match, the builder gathers every piece of information we hold, scores every market, and keeps only the single market it is most confident will win. If no market reaches the confidence bar, the match is shown as "No bet" with the reason, never forced.

Information combined per match (only what is actually stored, nothing invented):
- Model prediction (Dixon-Coles/Elo goal rates, 1X2, over/under, BTTS).
- Recent real results for both clubs: goals for/against, over 2.5 rate, BTTS rate, clean sheets, home/away split.
- Real match statistics: shots, shots on target, corners, cards, possession (feeds goals, corners and cards markets).
- Head-to-head history.
- Lineups: confirmed or projected, missing key players, injuries and suspensions.
- Player condition: fatigue/load, sharpness, form-rating trend of the expected starters.
- Managers: career win %, record vs this level, new-coach effect.
- Referee: cards and penalties per game (cards markets).
- Rest days between matches.
- 10-week self-review: how each market has actually performed, so markets that keep failing are scored down automatically.

Markets scored: home/draw/away, double chance, draw no bet, over/under 1.5/2.5/3.5, BTTS yes/no, team to score, corners over/under, cards over/under.

Each market gets an agreement score: how many independent signals point the same way. A pick needs both high calibrated probability and strong agreement; one strong signal alone is not enough. The home side gets no automatic bonus beyond its measured home effect.

## 3. What you see on the AI Bets page
- A "Match Picks" list: each match shows the chosen pick, its win chance, a confidence level (high/medium), and 3–5 short reasons drawn from the facts above (e.g. "Both teams scored in 7 of last 8", "Away side missing two starting defenders").
- "No bet" matches listed separately with the reason.
- Filter by confidence and league.
- Every pick is saved daily and graded win/loss after the match, with a running hit rate per market and per confidence level.
- The old 20-leg slip is replaced by this list; small 2–4 pick slips stay as an optional extra built only from high-confidence picks.

## Technical details
- New pick scorer in `src/lib/models/` (pure functions, tested with sample matches); `getAiBets` loads team_match_stats, h2h, injuries, player_conditions, referee_stats, coach data and calibration in batched queries and calls the scorer.
- Picks logged to ai_bet_log with slip_type "match_pick"; existing grading/settlement reused.
- Weekly self-review extended to report hit rate per market and confidence band, feeding back into the scorer's market multipliers.
- Remove `src/lib/odds.server.ts` and `src/routes/api/public/hooks/odds-refresh.ts`; migration adds a "retired" comment on odds_snapshots.
