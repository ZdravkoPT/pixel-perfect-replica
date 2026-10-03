# Final plan: everything left to make the app top notch

This combines what is still open from review #5 with a last round of new ideas. It covers the AI, data, users, trust and the app's daily running. After this, the app has no known gaps against FotMob or Sofascore for what it does: honest AI picks.

## A. Finish what is open (review #5)
1. **Form score everywhere.** Show it next to every player in match line-ups. Add "key player in form / out of form" as a small factor in picks, only when they have 3+ recent games.
2. **Team style profiles.** Possession, shots, xG for and against, corners, cards and fouls, ranked within each league. Shown as a radar on team pages, plus a "style clash" note on match pages (for example, high-press side vs slow build-up).
3. **Pick explainer + share card.** The 3 strongest reasons, how many models agree, and confidence. A one-tap shareable image.
4. **"My day" panel.** For followed teams: next games, picks, injuries and results since your last visit.
5. **Personal bet tracker.** Mark the picks you followed and compare your record with the AI's.
6. **More history.** Openfootball extra leagues (Scotland, Belgium, Turkey, Greece) and the ClubElo history file, so lower-league clubs get picks instead of "No bet".
7. **Polish.** Cache the model leaderboard (about 1 minute to load now), merge duplicate players in search, and fix layouts on mobile.

## B. New AI ideas (accuracy)
8. **Line-up-aware strength.** When line-ups are confirmed, rescale each team's strength by the form scores and minute shares of who actually starts versus their usual eleven. This is the biggest accuracy gain left.
9. **Goalkeeper factor.** Shots-on-target saved vs our xG model over the last 10 games. A hot or cold keeper nudges goals markets.
10. **Set-piece strength.** Share of goals and xG from corners and free kicks, from stored shot data. Feeds corners picks and "both teams to score".
11. **Manager tactics change.** Detect a formation change in the last 3 games and add a little caution for one or two games.
12. **Self-correcting thresholds.** Every Monday, re-tune each market's minimum chance from the last 60 settled picks, so the bar rises or falls with proven accuracy. Stays within safe limits.
13. **Upset radar.** A separate small list of games where the underdog's chance is clearly higher than usual. Shown as information, not as picks.

## C. New product ideas (people come back)
14. **AI written match preview.** A short, plain-language preview per big match, written only from stored facts (form, absences, style, picks). Missing facts are left out. Cached once per match.
15. **Ask the AI.** A chat box on match and team pages: "why this pick?", "how does X play away?". Answers only from the app's own data.
16. **Weekly report card.** Every Monday: last week's picks, wins and losses, the best and worst calls, and what the AI learned.
17. **Prediction game.** Signed-in users predict scores and get a leaderboard against each other and against the AI. A reason to sign up.
18. **Installable app + alerts.** Install the site to the home screen. Optional alerts for goals, line-ups published and new picks for followed teams.

## D. Trust and running smoothly
19. **Public transparency page.** Every pick ever made, with the time it was made (picks cannot be changed afterwards), result and running record. Downloadable.
20. **Auto-retry + alerts for jobs.** A failed scheduled job retries once. Repeated failures show a red banner on Diagnostics.
21. **Data freshness labels.** Every page shows "updated X min ago" for its data source.
22. **Responsible-use notice.** A short note on AI Bets: "probabilities, not guarantees", plus an 18+ reminder.

## Not doing (decided before)
Bookmaker odds. Scraping Transfermarkt or Sofascore. Made-up physical stats. Missing data stays blank everywhere.

## Suggested order
A1, B8, A2, B9–B10, A3, B12, D19–D22, A4–A5, C14–C16, B11, B13, A6, C17–C18, A7.

## Technical details
- New tables (public read, service write, RLS + grants): `team_style` (weekly), `keeper_form`, `set_piece_profile`, `market_thresholds` (weekly tuning history), `match_previews` (AI text + fact snapshot), `weekly_reports`. User tables with own-row RLS: `user_bet_follows`, `user_predictions`, `push_subscriptions`.
- B8: compare starting XI form/minute share vs the team's 5-game usual XI; multiply λ by a bounded factor (0.9–1.1) in models/match-picks.ts; only when the line-up is confirmed or projected.
- C14–C15: Lovable AI Gateway, default model, server-side; the prompt holds only a JSON fact pack from the database; previews cached per match; chat streams.
- C18: web app manifest + service worker for install; web push needs a VAPID key pair stored as secrets.
- D19: public route reading ai_bet_log (already append-only for settled rows); CSV export.
- D20: wrapper in private.call_hook path: retry once after 5 min; failures counted on /admin.
