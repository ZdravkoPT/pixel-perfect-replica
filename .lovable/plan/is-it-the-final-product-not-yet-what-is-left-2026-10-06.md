# Is it the final product? Not yet — what is left

## Verdict
The prediction engine is close to final. It has 10 competing models, about a 77% record that matches what it expected, and picks that use form, the actual line-ups, goalkeepers and set pieces. The product around it is not finished: 14 items from the final plan are still open. Most are about trust and reasons to come back, which is where FotMob, Sofascore and Flashscore are still ahead.

## What the big platforms have that we still miss
| Platform feature | Where | Status here |
|---|---|---|
| "Updated X min ago" and fully live data | FotMob, Flashscore | Missing (D21) |
| Personal feed for followed teams | FotMob, OneFootball | Missing (A4) |
| Prediction games and leaderboards | Sofascore votes, Superbru | Missing (C17) |
| Installable app with push alerts | All | Browser alerts only (C18) |
| Written previews and AI Q&A | OneFootball, Opta Analyst | Missing (C14, C15) |
| Public record of every past pick | Tipster sites (Pickwise, Tipstrr) | Partly: track record page, no full downloadable list (D19) |
| Clean search without duplicates, phone layout | All | Duplicates remain, phone layout unchecked (A7) |
| Transfers, heatmaps, bookmaker odds | Transfermarkt, Sofascore | Not doing: these sites block automated access, odds were declined, and we don't make up physical stats |

## New ideas from this review
1. **Reason accuracy:** for every kind of reason (form, keeper, line-up, weather), track how often picks that used it won. Shown on the track record page.
2. **Pick change log:** when the hourly refresh changes a pick before kickoff, keep the old version and say why it changed (for example, line-up confirmed).
3. **Line-up countdown:** match pages show "line-ups expected in about X min" and then highlight what changed.
4. **League pick quality map:** a grid showing how good the picks are in each league, so lower-trust leagues are clearly marked.
5. **Daily briefing:** one short morning summary of today's best picks and key absences, shown in the app and in the share format.

## Build order
1. Remaining trust items: B12 self-adjusting minimum chances, D19 public list of every pick, D20 failed jobs retry once with an alert, D21 "updated X min ago" labels, D22 responsible-use note.
2. Reasons to come back: A4 "My day" panel, A5 personal bet tracker.
3. AI text: C14 match previews, C15 Ask the AI, C16 weekly report card. Each uses only stored facts.
4. Accuracy extras: B11 formation-change caution, B13 upset radar, new ideas 1 and 2.
5. Data: A6 extra Openfootball leagues plus the ClubElo history file.
6. People: C17 prediction game, C18 installable app with push alerts, new ideas 3–5.
7. A7 polish: cache the leaderboard, merge duplicate players, check the phone layout. Also add the style-clash note on match pages that A2 skipped.

## Not doing
Bookmaker odds, scraping Transfermarkt or Sofascore, and made-up stats. Missing data stays blank.

## Technical details
- B12: `market_thresholds` table, Monday job re-tunes each market's floor from its last 60 settled picks, kept between 0.60 and 0.75; models/match-picks.ts reads it.
- D19: public route over ai_bet_log with CSV export. D20: retry wrapper around the hook calls, plus a failure banner on /admin.
- Idea 1: group settled ai_bet_log rows by reason prefix. Idea 2: `pick_revisions` table written when the hourly refresh changes a pick.
- C14–C16: Lovable AI Gateway server-side; the prompt holds only a JSON fact pack; results cached in `match_previews` and `weekly_reports`.
- User tables (user_bet_follows, user_predictions, push_subscriptions) only allow each user to see and change their own rows. C18 push needs VAPID keys stored as secrets.
