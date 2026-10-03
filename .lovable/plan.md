# Product review #4: where we stand and what to build next

## Where the app stands today
- **Picks:** 394 AI picks logged. 233 won, 70 lost, 87 are still waiting for a result and 4 were cancelled. That is 77% of the settled picks. The engine uses form, head-to-head, Elo, xG, squad values, absences, league table, weather, travel and fixture congestion, and gives "No bet" when nothing clears the bar.
- **Models:** 10 prediction methods compete every Monday on 14,352 past matches. The Dixon-Coles + Elo blend still wins (50.6% right). Pi-ratings and Glicko are now in the competition, and an accuracy chart is on the AI Bets page.
- **Pages:** fixtures, live games, match center (shot map, momentum, player ratings), leagues (tables, leaders, team of the week, our xG), teams, injuries, players, coaches, referees, head-to-head, search, goal alerts.
- **Data gaps:** 122 upcoming matches stored. 6,181 player match lines. No bookmaker odds (you declined that service). Only 1 account has signed up, so watchlists and alerts are barely used.
- **To-do list is out of date:** league pages, injuries, search and our own xG model are built but not ticked off. One item is still open: following lower-league fixtures.

## What competitor apps have that we lack (FotMob, Sofascore, Flashscore, Forebet, Opta Analyst, Transfermarkt)
1. **Pick track record by type.** Hit rate split by market, league, confidence level and month, with a "where we're weak" warning. Forebet and Opta show their accuracy publicly.
2. **Before-kickoff checklist per match.** One short block covering confirmed line-ups, key players missing, referee card rate, weather, rest days and motivation (title race, relegation, cup rotation).
3. **Season simulator.** Run each league's remaining fixtures thousands of times to get title, top-4 and relegation chances (Opta Analyst style). We already have the model and the tables.
4. **Player value and form scores.** A FotMob-style season rating average, a form trend and "player of the month" per league, all from our stored player lines.
5. **Team style profiles.** Shots for and against, chance quality (xG per shot), set-piece share and counter-attack share. These come from our stored shots, like Sofascore's team attributes.
6. **Live win chance during matches.** The home/draw/away chance updates with the score, minute and red cards (FotMob and Opta both have this).
7. **Accounts and sharing.** Follow teams and leagues, a daily digest of picks for followed teams, and share cards for picks.

## Free outside sources worth adding
- **Openfootball, more leagues:** Scotland, Belgium, Turkey and Greece, so lower and mid leagues get richer history.
- **ClubElo daily history file:** fills club Elo gaps (the site is often down, so retry and keep what we have).
- **StatsBomb open data:** only to sanity-check our xG model, never as current form.
- **Transfermarkt:** still blocks automated access. Keep FotMob squad values.
- **Sofascore:** still blocked. Skip.
- **Bookmaker odds:** kept out, as you decided before.

## Build order
1. Tidy the to-do list. Finish following lower-league fixtures (add the competitions to the daily fixture import so their clubs get picks).
2. Pick track record page: hit rate by market, league, confidence and month, with automatic warnings when a market falls under 60% over its last 30 picks. That market then needs a higher bar.
3. Motivation and rotation signal: title race, relegation fight, nothing left to play for, and a cup game within 3 days. It comes from our league tables and fixtures and becomes a small extra input to picks, with the reason shown.
4. Season simulator on league pages: 10,000 runs using the competition winner's ratings, showing title, top-4 and relegation chances. It updates after each matchday.
5. Before-kickoff checklist block on every match page and pick card.
6. Live win chance during matches, recalculated from score, minute and red cards on the existing 5-minute live refresh.
7. Player form scores and team style profiles on player and team pages.
8. Followed teams digest (in-app list for now) and share card image for a pick.
9. Openfootball extra leagues + ClubElo history file.

Missing data stays blank everywhere. Nothing is estimated or made up.

## Technical details
- **New tables:**
  - `season_simulations` (league_id, run_at, team rows as jsonb)
  - `market_health` (market, window, hits, n, flag)
  - `match_motivation` (match_id, home/away flags)
  - Every table gets public read, service-only write, RLS and grants.
- **New scheduled jobs (they extend existing hooks; no new cron jobs):**
  - The simulator runs after the daily 03:30 import.
  - Market health runs after grading.
  - Motivation is computed inside `computeMatchPicks`.
- **Live win chance:** Poisson on the remaining minutes from pre-match lambdas, scaled by red cards. Stored in the `inplay` payload. Nothing new is saved.
- **New pages:** `/track-record`. The simulator becomes a section on `/leagues/$leagueId`.
- **Picks engine:** `models/match-picks.ts` gets `TeamExtras.motivation`. Market health thresholds raise `minProb` for flagged markets.
- **Lower leagues:** extend the fixture provider list. Team linking goes through `team-resolver.server.ts`, and unlinked clubs stay unlinked.
