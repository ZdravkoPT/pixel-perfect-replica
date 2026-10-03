# Upgrade review: what to improve and which GitHub projects to bring in

## Where the app is weak today (checked this session)
- **Few picks on international days:** 32 of 33 matches had no bet because national teams lack recent results in our data.
- **No expected goals (xG):** ratings use goals only, which swing a lot from game to game.
- **Corners and cards** can't be bet: we don't store the final match numbers needed to grade them.
- **Thin history:** about 300 days of results, so the model has a short memory and few head-to-head games.
- **Slow Match Picks section** (~1 minute to load) because everything is worked out on each visit.
- **Missing skill cards** for about half the players.

## GitHub projects worth using (ranked by accuracy gain)
These are mostly Python; the app can't run Python, so we either load their free data or rewrite their methods in our own code.

1. **football-data.co.uk + openfootball/football.json** (free data, no key): 20+ seasons of results with shots, corners and cards for ~25 leagues. Fixes thin history, head-to-head and corners/cards history.
2. **penaltyblog** (method port): improved goal models — Bivariate Poisson, zero-inflated Poisson, weighted Dixon-Coles — plus a model-ranking test. We fit all of them and keep whichever scores best on past matches.
3. **Understat xG** (free data, pattern from `soccerdata`/`understat` repos): match and team xG for the top 5 leagues back to 2014, plus FotMob xG for other leagues.
4. **eloratings.net / clubelo.com** (free data): national-team and club Elo ratings with long history. Fixes "no bet" on international days.
5. **transfermarkt-api (felipeall)**: squad market values and injuries — a strong team-strength signal that also fills missing player ratings. Unofficial, may break.
6. **StatsBomb open-data + socceraction** (method ideas only): "value of each action" player ratings; useful later for player cards, low betting impact.

## What gets built
1. **History import:** load football-data.co.uk and openfootball seasons into results, with final corners and cards; match teams to ours by name.
2. **Corners and cards bets:** grade them from stored numbers and add them to Match Picks (with the referee's cards-per-game).
3. **xG:** store per-match xG (Understat for the top 5 leagues, FotMob elsewhere) and blend xG ratings into the goal model.
4. **Model competition:** weekly fit of Dixon-Coles, Bivariate Poisson and zero-inflated Poisson; the one with the best score on recent past matches becomes active automatically.
5. **Elo ratings:** import club and national Elo, used as another signal so international matches can get picks.
6. **Market values:** weekly Transfermarkt squad values used as a team-strength signal.
7. **Speed:** work out Match Picks every 30 minutes on a schedule and store them, so the page loads instantly.

## Technical details
- New tables: historical_results, team_xg (exists), elo_ratings, market_values (exists), match_picks (precomputed); grants + RLS (public read, service write).
- Scheduled routes under `/api/public/hooks/` with the existing cron secret: history (weekly), xG (daily), Elo (daily), market values (weekly), match picks (every 30 min).
- Model ports in `src/lib/models/` as plain TypeScript, each checked against the current model on the same past matches before being switched on.
- Missing data stays blank; nothing is estimated to fill gaps.
