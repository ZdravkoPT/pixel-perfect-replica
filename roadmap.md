# Roadmap (final plan)

- [x] Connect and inspect the external Neon destination — connection verified; no application tables exist yet.
- [x] Schema (60 tables) + data copied to Neon Nov 3 (scripted batch copy, on conflict do nothing). Re-sync the newest rows (predictions etc. keep growing) right before cutover.
- [x] App data access switched to Neon (Nov 3), pages verified loading.
- [ ] Speed: some pages (e.g. AI bets) load slowly over Neon — batch queries.
- [ ] Move sign-in off Lovable Cloud auth; move 17 scheduled jobs to an outside scheduler. Was: Migrate shared data access, account security and all 17 automatic hook tasks to the external setup; verify preview and online use before cutover. No existing data or jobs may be removed before validation.
- [x] Automatic detailed news reader, durable queue/credit pause, team and match opinion wiring; extraction/attribution tests and real refresh checked.
- [ ] Verify a real detailed AI news opinion and its prediction refresh — blocked by AI gateway “Not enough credits” (384 articles queued).

- [x] A1 form score in line-ups + picks factor
- [x] B8 Line-up-aware strength
- [x] A2 Team style profiles
- [x] B9 Goalkeeper factor / B10 Set-piece strength
- [x] A3 Pick explainer + share card
- [x] B12 Self-correcting market thresholds
- [ ] D19 Public transparency page
- [ ] D20 Job auto-retry + alerts
- [ ] D21 Data freshness labels
- [x] D22 Responsible-use notice
- [ ] A4 My day panel / A5 Personal bet tracker
- [ ] C14 AI match preview / C15 Ask the AI / C16 Weekly report card
- [x] B11 Tactics change
- [x] B13 Upset radar
- [ ] A6 Openfootball extra leagues + ClubElo history
- [ ] C17 Prediction game / C18 Installable app + alerts
- [ ] A7 Polish (leaderboard cache, duplicate players, mobile)
