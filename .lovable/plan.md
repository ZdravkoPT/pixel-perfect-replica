# Upgrade review #2 — what we have, what's missing, new GitHub sources

## What the app already does
- Fixtures, live scores, calendar, match center (pitch, stats, insights, facts)
- Squads, player/coach/team stats pages, FIFA-style cards, compare, distance per 90 (own data)
- Match Picks: one pick per match or "No bet", using model goals, form, H2H, Elo, xG, squad values, injuries, lineups, coach records, referee cards, plus the weekly model competition winner
- Bet log with automatic grading, 10-week self-review, small slips, manager picks
- Data: FotMob (live, lineups, stats, xG, profiles), football-data.co.uk (28.7k results), eloratings.net, clubelo (often down)

## Remaining weaknesses
1. Picks are only checked "after the fact" weekly — no per-signal report showing which inputs actually help.
2. Probabilities are not re-calibrated per market (corners, cards, BTTS each drift differently).
3. Lower leagues and national teams lack xG, values and form, so many "No bet".
4. Match-stats import fails about half the time (timeouts).
5. No weather, travel distance, fixture congestion or motivation (title/relegation/dead rubber) signals.
6. Player-level impact is crude: a missing star counts the same as a missing backup.

## New GitHub / open sources not used yet
| Source | What it gives | Use |
|---|---|---|
| openfootball/football.json + worldcup.json | Free fixtures/results incl. national teams, many leagues | Fill national-team and lower-league form |
| martj42/international_results (Kaggle/GitHub) | Every international match since 1872 | National-team history, H2H, Elo check |
| statsbomb/open-data | Free event data (shots, passes) for selected competitions | Train our own shot xG model |
| ML-KULeuven/socceraction (VAEP/xT ideas) | Player action value method | Rank player importance so star absences weigh more |
| Open-Meteo (open API, no key) | Match-day weather forecast | Rain/wind lowers goals signal |
| penaltyblog (more methods) | Bivariate / zero-inflated Poisson, ranked probability score, isotonic calibration | Add 2 more models to the competition + better calibration |
| scikit-learn style isotonic/Platt calibration (ported) | Per-market calibration | Fix over/under-confidence per market |
| fbref via soccerdata (ideas only; site blocks bots) | Not integrable reliably | Skip |
| Understat | Top-5 league xG back to 2014 | Deeper xG history for the model competition |

## Proposed build order
1. Fix the match-stats import reliability (smaller batches, retries).
2. Signal report: for every settled pick, store which signals agreed; show hit rate per signal on /ai-bets and auto-drop signals that hurt.
3. Per-market calibration (isotonic) from settled bets, applied before the 0.62 bar.
4. International results history (martj42) + openfootball to cover national teams and smaller leagues.
5. Context signals: fixture congestion (days rest, games in 14 days), travel distance, weather (Open-Meteo), motivation from league standings.
6. Player importance: weight absences by minutes share, rating and value so star injuries matter more.
7. Two extra models in the weekly competition (bivariate and zero-inflated Poisson) plus Understat xG history.

## Technical notes
- New tables: international_results, pick_signal_log, market_calibration, match_context (weather/travel/rest); all public-read, service-write, linked via team-resolver.
- All new data stays blank when missing; nothing estimated.
- Each step ships with a cron hook under /api/public/hooks and is verified with tsgo + a browser check.
