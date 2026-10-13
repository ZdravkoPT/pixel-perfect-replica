# Your ideas vs what the app already has (nothing removed)

## Already built
- Match pages, fixtures with filters, real-data pipeline, historical results (football-data.co.uk, Understat, openfootball, internationals)
- Elo (eloratings + clubelo), time-weighted Dixon-Coles, xG model, pattern learner, Pi-ratings, Glicko, blended learner — 13 methods compete weekly, walk-forward, no future data
- Calibration per market and per league; line-up-aware strength re-run before kickoff
- One honest pick per match with "No bet", sanity gate, upset radar, safer markets
- Pick ledger (timestamped, immutable), auto-grading, track record by league/market/month, calibration chart, self-adjusting thresholds
- Explanations from real numbers, freshness/missing-data notices, share cards, watchlist, goal alerts

## Not doing (your earlier decisions)
- Bookmaker odds, de-vig market blend, CLV, best-price finder, steam alerts, Kelly staking on real odds, 10k-run builder priced against bookmakers — all need odds, which you declined.

## What we add

### 1. Football news feed (biggest gap — the News tab still says "later")
- Free RSS sources: BBC, Guardian, Sky Sports (EN); Sportal.bg, Gong.bg, Blitz (BG)
- Fetched every 15 min + "Refresh now"; same link never stored twice; failures logged per source
- /news page: search, filters (source, language, team, time, breaking), cards with "Read original"
- /sources page: each source's status, last success, last error
- AI reads headline + summary only: category, teams, players, Official / Reported / Rumour, importance 1–5, one-line impact
- Same story from several sites grouped into one
- Match page News tab: linked stories; a confirmed injury/suspension/manager change shows "Prediction needs review" — picks never change automatically

### 2. Six analyst reports per match
- Statistics, Squad, Tactical, Risk, Chief (Market analyst reports "no odds used" by design)
- Each gets only stored numbers for its area and must return findings, evidence, sources, what is missing; may disagree
- Chief explains strongest evidence and counter-argument; cannot change probabilities
- Built in the background for upcoming matches, cached, shown as a new "Analysts" tab

### 3. Ask about this match
- Chat on the match page answering only from stored data; says "not in our data" otherwise

### 4. Model report upgrade
- Per method: comparison to simple baselines (always home, table-based), confidence ranges, small-sample warnings, drift over recent weeks

## Order
1 → 2 → 3 → 4. Each step tested before the next.

## Technical details
- New tables (public read, service write, RLS): news_sources, news_articles (unique canonical_url), news_fetch_runs, news_analysis, news_stories, match_news_links, analyst_reports
- RSS parsed in a Worker-safe server function; cron route under /api/public/hooks/news with LOVABLE_CRON_SECRET
- AI via Lovable AI Gateway, server-side, structured output; usage logged
- Tests: RSS parsing, URL normalization/dedup, team-to-match linking
