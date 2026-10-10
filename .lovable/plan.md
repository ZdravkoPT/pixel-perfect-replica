# Upgrade review: making the AI picks smarter (GitHub + platform research)

## Where the picks stand
- 11 prediction methods compete every Monday on ~14,350 past games; the new blended learner won narrowly last run.
- Picks already use: form, line-up strength, injuries, Elo, xG, squad values, goalkeeper, set pieces, formation change, weather, travel, motivation, reason track record, self-adjusting market minimums.
- Biggest remaining weaknesses: few games with full data in smaller leagues, picks only look at 1X2 / goals / BTTS / corners / cards, and the chance numbers are tuned per market but not per league.

## Ideas from GitHub projects and platforms

| # | Idea | Inspired by | Gain |
|---|---|---|---|
| 1 | **Gradient-boosted match model** (trees over all our signals: Elo gap, xG form, line-up strength, rest, keeper, set pieces) entered as a 12th method in the Monday competition | penaltyblog, Footy-Prophet, many Kaggle notebooks | High |
| 2 | **Per-league calibration** — correct each league's percentages separately (isotonic/Platt), since Eredivisie and lower leagues were over-confident | ProphitBet, sklearn calibration practice | High |
| 3 | **Time-decayed ratings** — recent games weigh more (half-life tuned in the competition) for Dixon-Coles and the blend | penaltyblog, Dixon-Coles paper | Medium-high |
| 4 | **Player-based team strength** (sum of starters' ratings + minutes, like "plus-minus" models) instead of only team history | soccer-xg / openfootball-based player models | Medium-high |
| 5 | **Live-trained in-play model** — red cards and xG so far change the live chance (today red cards are ignored) | FotMob/Sofascore live win probability | Medium |
| 6 | **New markets**: double chance, draw-no-bet, team over 1.5, first-half over 0.5 — the AI can pick safer markets when the main one fails the bar | Bet-builder style on Flashscore/Sofascore | Medium (more picks, same honesty) |
| 7 | **Scoreline-correlation fix for same-game combos** — when one ticket mixes markets from one match, compute the joint chance from the score grid instead of multiplying | bivariate Poisson literature | Medium |
| 8 | **Upset/variance flag** — mark picks where the score grid is spread out (high uncertainty) and lower confidence | betting-model repos (Kelly + entropy) | Small-medium |
| 9 | **Monthly back-test report** — re-run all picks on last season with today's rules and show what would have won | ProphitBet, soccerdata examples | Trust |

Not recommended: bookmaker odds (you declined), FBref / Sofascore / WhoScored / Transfermarkt scraping (blocked), FIFA game ratings (not real performance).

## Suggested order
1, 2, 3, 6, 4, 7, 5, 8, 9. Each new model or rule goes live only if it beats the current one on games it hasn't seen. Missing data stays blank.

## Technical details
- Boosting: small pure-TS gradient-boosted stumps (no Python) trained walk-forward inside `model-competition.server.ts`, key `gbm`; features from existing tables.
- Calibration: per (league, market) isotonic map fitted from `ai_bet_log` settled picks, ≥40 picks, else global; applied in `models/match-picks.ts` before thresholds.
- Time decay: exponential weight ξ in Dixon-Coles fitting; ξ grid-searched weekly.
- New markets: derived from the existing score grid; graded from stored scores (first-half needs FotMob half-time score, else market disabled).
- In-play: extend `models/inplay.ts` with red-card multipliers and live xG from FotMob.
