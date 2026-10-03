# Gap analysis: FotMob, Sofascore, Transfermarkt, GitHub — and what to add

## What the app already has
- FotMob: fixtures list and match details only (lineups, box-score stats, events, form, H2H, live clock/cards/subs).
- Models: Elo, Poisson, Dixon-Coles, context adjustments (coach change, squad quality, home effect), in-play re-scoring.
- Bets: only "fair odds" from our own model. No real bookmaker prices are stored, so the app cannot tell if a pick is actually value. The Odds API is listed as a source but inactive.

## Biggest gaps (ranked by accuracy impact)

1. **Real bookmaker odds + closing line** (biggest gap). Without market prices, the model can't measure value or learn from the closing line, the best known accuracy signal. Source: The Odds API (free 500 requests/month, needs your free key). Store opening/T-60/closing prices, compute edge and closing-line value per pick, and only recommend picks with a real edge.
2. **Expected goals (xG) per match and team** from FotMob shot maps (already free in match details, not yet saved). Rate teams on xG for/against instead of goals only; goals are noisy, xG predicts the future better.
3. **FotMob league tables, team pages and player ratings** (free endpoints not used yet): standings, home/away tables, xG tables, per-player season ratings. Adds motivation (title/relegation/nothing to play for) and more complete player ratings, fixing missing skill cards.
4. **Transfermarkt market values and injuries** via an open community scraper API (GitHub: felipeall/transfermarkt-api) — squad value is one of the strongest pre-match strength signals; plus injury/suspension history and transfers. Runs unofficially; may break or be rate-limited.
5. **Sofascore**: blocks us (403) — skip; FotMob + Transfermarkt cover the same ground.
6. **Historical results with odds** from football-data.co.uk (free CSVs, 20+ seasons, includes closing odds, shots, corners, cards). Lets us backtest properly and calibrate corners/cards markets on real history.
7. **Ideas from GitHub models**: penaltyblog (Dixon-Coles/Bivariate/zero-inflated models, odds de-margining), soccerdata (scraper patterns for FBref/Understat), Understat xG for the top 5 leagues. We port the methods to TypeScript, not the Python code.

## Model upgrades once data is in
- Blend model probability with de-margined market probability (market is hard to beat; blend improves calibration).
- xG-based attack/defence ratings feeding Dixon-Coles.
- Motivation, rest days, travel and market-value gap as features.
- Weekly self-review tracks closing-line value, not just hit rate.
- Pick filter: recommend only when model edge vs best price is positive after calibration.

## Proposed order
1. Odds ingestion + edge/CLV (needs your free Odds API key).
2. xG from FotMob shot maps + league tables/motivation.
3. football-data.co.uk history import + backtests.
4. Transfermarkt market values/injuries.
5. Model blend + new features + review update; show edge and CLV on Value and AI Bets pages.

## Technical details
- New tables: odds_snapshots (match, bookmaker, market, selection, price, captured_at; immutable), team_xg, league_standings, market_values; all with grants + RLS (public read, service writes).
- Crons: odds every 2h and at T-60/kickoff; standings daily; market values weekly.
- Never invent missing numbers; unavailable data stays blank.
