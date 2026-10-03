# Full product review #3 — what we have, what rival sites offer, what to add

## What the app has today
- Fixtures, calendar, live scores, match center (pitch, line-ups, side-by-side stats, insights)
- Squads, player and coach pages, career/transfer history, FIFA-style cards, compare, team stats, form charts, distance page (own tracking only)
- Match Picks: one pick per match or "No bet", using 7-model weekly competition, Elo, xG (FotMob + Understat), squad values, absences weighted by minutes, congestion, league table, weather, travel, referee cards, learned source weights, per-market calibration
- Bet log with auto-grading, weekly self-review, small slips, manager picks
- Data: FotMob, football-data.co.uk, martj42 internationals, openfootball, eloratings/clubelo, Understat, Open-Meteo

## What rival sites show that we don't (gap list)
| Feature on FotMob / Sofascore / Transfermarkt / Flashscore | Have? | Can we add? |
|---|---|---|
| Shot map per match (location, xG per shot) | No (only totals) | Yes — FotMob match details already include shots |
| Momentum / attack-pressure graph | No | Yes — FotMob momentum data |
| Player match ratings (per game) | Partial | Yes — FotMob player stats in match details |
| Full league tables page (home/away/form/xG table) | Only used internally | Yes — FotMob tables + our own |
| Top scorers / assists / cards leaders per league | No | Yes — FotMob league stats |
| Team of the week / best XI | No | Yes — built from player ratings |
| Injury & suspension list per team with return date | Partial (30 entries) | Yes — FotMob team pages; Transfermarkt blocks bots |
| Transfer news / rumours | No | Partial — Transfermarkt blocked; FotMob transfers feed is usable |
| Player heatmaps / touch maps | No | Only where StatsBomb open data exists (few competitions) |
| Push notifications (goals, line-ups, pick result) | No | Yes — browser notifications for followed teams |
| Search across teams/players/leagues | No | Yes — from our own data |
| Predicted line-ups visible before T-60 | Stored, partly shown | Yes — show on match card |
| Sofascore-style "attribute overview" radar | Cards only | Yes — from our existing skill numbers |
| Head-to-head deep page | Panel only | Yes — from 28k+ history rows |

Sofascore still returns 403 to automated requests — anything it has we take from FotMob instead.

## New ideas using GitHub / open projects
1. **Own shot xG model** (statsbomb/open-data + ideas from `socceraction`): train a small shot-quality model so we have xG in leagues where FotMob has none — fills many "No bet" games.
2. **Expected threat (xT) player value** (`socceraction`): ranks how much each player creates; feeds absence weighting and player cards.
3. **Pi-ratings / Glicko team ratings** (ideas from `penaltyblog` and academic repos): add as two more models in the weekly competition.
4. **Ranked probability score + calibration charts** (`penaltyblog`): show on AI Bets how well-calibrated picks are per market.
5. **Referee profiles page** (our own data + FotMob): cards, penalties, home bias per referee.
6. **openfootball fixtures for followed lower leagues**: start following League One/Two and Austria so those clubs get picks.
7. **Club-strength from transfer spending** (FotMob transfers feed) as a slow-moving strength signal.

## Proposed build order
1. Match center upgrade: shot map, momentum graph, per-player match ratings.
2. League pages: tables (overall/home/away/form/xG), top scorers/assists/cards, team of the week.
3. Injuries & suspensions list per team with return dates (also improves absence weighting).
4. Global search + browser notifications for followed teams and pick results.
5. Own shot xG model + xT player value.
6. Pi-ratings and Glicko in the model competition; calibration chart on AI Bets.
7. Referee page and deep head-to-head page.
8. Follow lower leagues' fixtures so they get picks.

## Technical details
- New tables: match_shots, match_momentum, player_match_ratings, league_player_leaders, team_injuries (with expected return), shot_xg_model (coefficients), player_xt; all public read, service write, with grants + RLS.
- New routes: /leagues/$code, /referees/$id, /h2h/$a/$b, /search.
- Crons under /api/public/hooks: shots/momentum/ratings with match-stats import; leaders and injuries daily.
- Missing data stays blank; nothing estimated.
