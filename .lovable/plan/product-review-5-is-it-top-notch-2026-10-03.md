# Product review #5: is it top notch?

## Verdict
The prediction engine is strong. It is honest, self-checking and broad: 10 competing models, track record at 77% (matching expected), 33 pages, 250 upcoming games across about 40 competitions. It is not top notch yet. Three things hold it back:
1. **Reliability.** Settled pick counts (233 won / 70 lost) have not changed since the last review. 17 picks are still "pending" more than a day after kickoff, so grading looks stalled. A top product never shows stale results.
2. **Depth of player and team insight.** Player form scores, team style and a proper player profile are still missing. FotMob and Sofascore lead on these.
3. **Reasons to come back.** There is 1 account and no digest, sharing or personal tracking. The app is a tool, not yet a habit.

## Build order
1. **Health fix + watchdog.** Find out why grading stalled (verify first, then fix). Add a small "System health" admin page with the last run, success or failure, and rows handled for every scheduled job. Retry jobs that fail automatically.
2. **Player form score (0–100).** Built from last 5 games: minutes, rating, goals, assists, shots and our xG. Shown on player pages and line-ups, and as a "key player in form / out of form" reason line in picks.
3. **Team style profiles.** Possession, shots for and against, xG for and against, corners, cards and pressing proxy (fouls). League-relative percentiles shown as a radar on team pages, plus a "style clash" note on match pages.
4. **Pick explainer card + share image.** For each pick: the 3 strongest reasons, model agreement and confidence. One-tap share as an image or link.
5. **Followed teams digest.** Daily in-app "My day" panel: next games, picks, injuries for followed teams. Optional email later.
6. **Personal bet tracker.** Users mark which AI picks they followed and see their own record next to the AI's.
7. **Openfootball extra leagues + ClubElo history file.** Already on the to-do list. Gives more past data so new lower-league clubs get picks instead of "No bet".
8. **Polish pass.** Faster AI Bets leaderboard (cache it, currently about 1 minute), merge duplicate players in search, mobile layout check of key pages.

## Not doing
Bookmaker odds (declined). Transfermarkt or Sofascore scraping (they block bots). Any made-up physical stats. Missing data stays blank.

## Technical details
- Step 1: query ai_bet_log pending rows past kickoff + ingestion_jobs for live-refresh / bet-review; check cron runs. New `job_health` view over ingestion_jobs; admin-only route `/admin/health` guarded by has_role.
- Step 2: `player_form` table (player_id, score, components jsonb, as_of), computed after the daily 03:30 match-stats import; signal added to models/match-picks.ts as a small nudge only when ≥3 recent games.
- Step 3: `team_style` table computed weekly from team_match_stats + match_shots; percentiles per league.
- Step 4: render share image client-side (canvas from DOM) — no server image tools.
- Step 5–6: `user_bet_follows` table (user_id, bet_log_id) with own-row RLS + grants; digest reads favorites.
- Step 8: cache leaderboard result in model_competitions row; merge players via provider_ids overlap into player_aliases.
