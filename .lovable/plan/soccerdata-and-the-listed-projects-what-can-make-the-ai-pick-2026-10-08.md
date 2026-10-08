# soccerdata and the listed projects: what can make the AI picks better

## Short answer
We can't plug soccerdata in as it is. It's a Python library, and the app's server only runs JavaScript, so it can't run Python code. We can still copy its ideas, and we can call the same free sources directly from our own code. Most of the list is already in the app.

| Source / project | In the app? | Can we use it for picks? |
|---|---|---|
| Club Elo | Yes (daily) | Already used |
| Football-Data.co.uk results | Yes (16 leagues × 6 seasons) | Already used (no odds, as you decided) |
| Understat xG | Yes (top 5 leagues) | Already used |
| openfootball | Yes (lower leagues) | Already used |
| Dixon-Coles, Elo, Pi-ratings, simulations (Reymes, jdgoated1) | Yes (10 models compete weekly) | Already used |
| **ESPN** (free, no key) | No | **Yes**: a backup source for fixtures, line-ups and team stats, since the API-Football account is suspended. It helps when FotMob is missing a game. |
| **Model-blending learner** (Reymes, jdgoated1, Footy-Prophet) | No | **Yes, the biggest gain.** Instead of picking one winning model, a small learner uses past results to work out how much to trust each of the 10 models. It's tested the same honest way, on games it hasn't seen, and only goes live if it beats the current winner. |
| StatsBomb open data | Partly (only to check our chance model) | Small gain: more shots to train our chance model better |
| FBref | No | Not worth it: it blocks automated access and lost most advanced stats in 2026 |
| Sofascore, WhoScored | No | Blocked (Sofascore returns "access denied"; WhoScored uses bot protection) |
| SoFIFA game ratings | No | Skip: video-game ratings, not real performance |
| ProphitBet profit metrics | No | Needs bookmaker odds, which you declined |

## What to build (picks only)
1. **Model-blending learner.** Add it as an 11th entry in the Monday competition, trained on the 14,352 past games. If it wins, picks use it automatically.
2. **ESPN backup feed.** When FotMob has no line-up or match statistics for a game, fill the gap from ESPN. Picks get line-up strength and form data for more games.
3. **StatsBomb shots.** Add their free shots to the training data for our chance model, then compare test error with today's model (0.294) and keep whichever is better.

Nothing is made up: if neither source has a value, it stays blank.

## Technical details
- Stacking: multinomial logistic regression (pure TS) over each model's walk-forward 1X2 probabilities from `model-competition.server.ts`; fitted only on prior folds; scored by log-loss/RPS like the others; key `stacked`.
- ESPN: `site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard|summary` in a new `providers/espn.server.ts`, linked through `team-resolver.server.ts`; called from the match-stats and kickoff jobs only when FotMob data is missing; source recorded in `match_sources`.
- StatsBomb: raw GitHub JSON events (shots only) appended to xG training in `shot-xg.server.ts`; never shown as match data.
