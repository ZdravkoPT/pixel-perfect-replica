# Pre-publish sanity gate + audit trail (from the uploaded spec, additive only)

## What happened (confirmed in the data)
- 10 Oct 2026, Sheffield United 3–0 Lincoln City: our AI picked "Lincoln City or draw" twice (65% and 65%). Both lost.
- Root cause found in `src/lib/models/match-picks.ts`: a source "agrees" with a double-chance pick if it gives that selection ≥50% — so a source that actually rated Sheffield United as favourite still passed the all-sources-agree gate.
- Per your answers: bookmaker odds stay out, fan sentiment stays out. Nothing existing is removed.

## Build order

### 1. Pre-publish sanity gate (`models/match-picks.ts`)
New pure check applied to every candidate pick before it is eligible, with three rules:
- **Direction agreement** — a source agrees only when the pick's outcome is also that source's own best outcome (not merely ≥50% for the selection). A double-chance pick needs the underlying sources to genuinely favour that side.
- **Table contradiction** — if the pick backs the side clearly weaker in the real standings (≥5 places and ≥0.4 points/game worse), the pick needs probability ≥ floor + 0.04 and every source in agreement, otherwise it is suppressed with an honest "No bet" reason ("backing the underdog against the table — needs stronger support").
- **Evidence guard** — picks relying on thin evidence (<4 recent games, no Elo, no model prediction) are capped at "medium" confidence and only become picks at floor + 0.05.
The gate logs when it suppresses a pick (reason code kept with the pick) so we can later measure whether the gate helps.

### 2. Post-match review on match pages (covers the Sheffield United–Lincoln case)
- For every graded pick on a finished match, a "Pre-match picture" panel shows: standings positions and points before kickoff, Elo, recent form, xG, line-up status — all from already-stored data, nothing estimated.
- If the published pick contradicted the standings or Elo direction, the panel says so plainly (e.g. "the AI backed the side sitting 8 places lower in the table") — the audit case the spec requires, generalized to every match instead of one hardcoded game.
- Served from the existing match facts loader; no new table needed.

### 3. Standings as an explicit source + opponent-adjusted form
- Add a standings-based 1X2 estimate (points-per-game conversion) as a named source in the blend, weight like Elo, so "sources" and the agreement count reflect it.
- Adjust each side's form by the average Elo of the opponents faced in those recent games (a 3-game winning run vs weak sides counts less) — computed in `match-picks.server.ts` from `historical_results` + `elo_ratings`.

### 4. Remaining picks upgrades already approved (kept in order)
- Per-league calibration (isotonic from settled picks per league+market, ≥40 picks, else global).
- Same-match combo fix: joint chance from the score grid when one ticket mixes markets of one match.
- High-uncertainty flag on picks whose score grid is spread out.
- Monthly back-test report page (re-run past picks with today's rules).
- New safer markets (double chance exists; draw-no-bet, team over 1.5) graded from stored scores.

## Constraints
- No bookmaker odds, no fan sentiment, no scraping of blocked sites, no fabricated data — missing evidence stays blank and says so.
- The weekly competition still decides which model wins; nothing is removed or overridden.
