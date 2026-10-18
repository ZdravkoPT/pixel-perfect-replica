# AI Football Intelligence

A football prediction platform that estimates what is likely to happen in a match, says how sure it is, and shows the evidence behind every number. It never invents data: anything it does not have is left blank and says so.

- **Live app:** https://id-preview--1853f281-bb30-408d-bb3c-488a9a226e46.lovable.app
- **This repository:** https://github.com/ZdravkoPT/ai-football-intelligence (one-time copy — see [Repository status](#repository-status))

---

## What we have

### The prediction engine

`src/lib/models/match-picks.ts` is the heart of the app. For every upcoming match it looks at all markets and chooses **one best pick — or no pick at all**. A pick is only made when:

- every available source points the same way,
- at least two independent signals agree,
- the estimated chance clears that market's minimum (normally 62%, raised automatically for markets that have been underperforming).

When nothing clears the bar the match is listed as **"No bet" with a reason** — the app never forces a pick to look busy.

Every pick carries:

| Item | What it means |
| --- | --- |
| Chance | AI probability, not a guarantee |
| Confidence | lowered when lineups are unconfirmed, evidence is thin, or the sources disagree |
| Reliability | 1.0 confirmed lineups · 0.97 projected · 0.94 neither |
| Why | the three strongest reasons, plus all reasons folded away |
| Sources | how many independent sources agree |

Safety gates applied before a pick is allowed:

- **Direction agreement** — a source only counts as support if the pick's outcome is that source's own best outcome.
- **Table contradiction** — backing a side that is 5+ places and 0.4+ points-per-game worse in the standings needs a higher bar and full agreement, otherwise it is suppressed.
- **Evidence guard** — fewer than 4 recent games, or no Elo/champion rating, means medium confidence and a higher bar.
- **Uncertainty flag** — a very flat 1X2 distribution lowers confidence and adds a reason line.
- **Per-league calibration** — a league/market combination that has been winning less than predicted has its chances scaled down.

Markets include 1X2, double chance (with and without draw), draw-no-bet, over/under team goals, both-teams-score and correct-score derived picks. The bet builder gives **at most one pick per match**, and the mega-slip holds up to 20 picks with a 0.72 reliability floor.

### The models, and how the winner is chosen

Goal models live in `src/lib/models/`: Poisson, Dixon-Coles, Elo, shot-based xG (our own model), plus context, in-play, intel and news-opinion layers.

Every Monday a **walk-forward competition** (`src/lib/model-competition.server.ts`) re-runs every model over league history, always predicting only games it could have predicted with the data available at that moment. The winner's ratings feed Match Picks as one extra signal. Nothing is hardcoded — if an older model wins a future run, it takes over by itself.

Current standings (14,352 past games):

1. **Blended learner — 50.6% hit rate, error 0.998 ← in use**
2. … Pi-ratings 6th, Glicko 8th
- Our own shot-xG model: error 0.286 (FotMob's own numbers: 0.268) — treated cautiously, not presented as better than it is.
- StatsBomb shots were tested and kept because they lowered error from 0.2863 to 0.2860; they are dropped automatically if a future run says they no longer help.

### Signals the picks use

- Elo ratings (eloratings.net / clubelo.com), imported into our own tables
- Historical results (football-data.co.uk), corners and cards
- xG from stored shot data, Understat xG where available
- Squad market values, summed from FotMob per-player values (a club needs 11+ valued current players, otherwise it stays unvalued)
- Player form score 0–100 over the last 5 games (`src/lib/models/player-form.ts`) — shown in lineups and used for key players (≥75 adds up to +1% expected goals, <40 removes up to −1%, capped at 3% total)
- Team style profiles — six measures over recent games against ~300 teams, needs 3+ games
- Goalkeeper form and set-piece strength from the last 10 games with shot maps, needs 5+
- Formation change detection — a new shape vs the usual one costs 1.5% expected goals
- Reason track record — every graded pick saves its reasons; reason types with 30+ graded picks nudge new picks by up to 3%
- Opponent-adjusted form and home/away splits
- News opinion (see below)
- Upset radar — games where the weaker side is rated 10+ points above its normal rate and has ≥30% chance to win. Information only, never a pick.

### Automatic news reading

`src/lib/news.server.ts`, `src/lib/news-reader.server.ts`, `src/lib/news-content.ts`

- **Every 15 minutes** all RSS feeds are fetched, duplicates from different sites are grouped into one story, and new headlines are tagged by AI for category, status, importance (1–5) and impact.
- **Important news** (official or reported injury, suspension, manager or lineup story, importance 4–5, about a team playing in the next 48 hours) triggers an immediate picks refresh instead of waiting for the next hour.
- **Full articles** are read one at a time, oldest first, from a durable queue with a database lease, so no article is paid for twice and no work is lost on a restart. Extraction is restricted to the publisher's own site and robots rules, follows up to 4 redirects, caps at 60,000 characters, and skips pages that are too short. If the gateway refuses or credits run out, the queue pauses persistently rather than retrying and wasting anything.
- Each article is parsed into **facts**, and each fact is linked to specific canonical teams. Evidence is bounded to `min(now, kickoff)` so future news can never leak into a historical prediction.
- **Match opinion** and **team opinion** are shown on the match page and team page: negatives and positives per team, with the source. Confirmed injury / suspension / manager news raises a **"Prediction needs review"** note.
- Six analyst reports per match (Statistics, Squad, Tactical, Risk, Market, Chief), cached 6 hours. The Chief names the strongest evidence **and** the strongest counter-argument. No report ever changes the chances.
- **"Ask about this match"** answers only from stored data and replies "That is not in our data" when it has nothing.

### Live and alerts

- In-play re-scoring (`src/lib/models/inplay.ts`) with a live win-chance graph, refreshed on a 5-minute schedule
- Goal alerts for watched teams via browser notifications (checked every 60 seconds)
- Kickoff refresh: stadium location, weather forecast and away travel distance

### Pages

Match Center (Facts, Line-ups, News, AI Prediction, AI review tabs) · Leagues · Teams · Squad · Players · Coaches · Referees · Head-to-head · Compare · Live · Fixtures · News feed · Sources · AI bets (model report, calibration, ranked score) · Track record · Analytics · Value · Watchlist · Search · Diagnostics (job health for admins) · Providers · Auth.

Missing figures always show a dash, never a guess.

### Data sources

FotMob is the primary provider (free, no key). ESPN is used **only** as a fallback for team match statistics when FotMob has none — those rows are marked and stay eligible for a later FotMob retry, because ESPN has no shot maps or player lines. Transfermarkt is not scraped (it blocks automated access); Blitz Sport is likewise left out with its 403 shown honestly on the Sources page.

### Backend

Lovable Cloud (Postgres): canonical IDs for every team, player, league, match and official; conflict logging when providers disagree; immutable, timestamped predictions; row-level security on every public table; scheduled jobs via `pg_cron` and server routes under `src/routes/api/public/hooks/` (17 jobs: fixtures ingest, match stats, news, picks, live refresh, model competition, Elo, injuries, market values, player careers, international results, Understat, intel, kickoff refresh, bet review, model training, history).

### Ground rules the app follows

- No bookmaker odds, no fan sentiment, no scraping of sites that block bots
- No fabricated physical stats, ratings or insights — absent data stays blank and says so
- Every number says where it came from and how recent it is
- 18+ and "bet responsibly" appear on every share card

---

## What we need to finish

### Blocked right now (needs the account owner)

1. **Resume the database.** The hosted database is paused, so the app cannot read or store news. Resume it under More → Database → Manage → Settings.
2. **Add AI credits.** The gateway answers "Not enough credits", so headlines are fetched and stored but not yet tagged, and full articles are not read. Add credits under Settings → Plans & credits.
3. **Then verify the news pipeline end to end.** 384 articles are queued. Once both items above are done, the reader works through them oldest-first, updates match and team opinions, and refreshes predictions when important news lands. Until someone actually watches that run, the feature is written and tested but **not proven on live data**.

### Built but unverified

- **Goal alerts** have never been exercised on a real match with a real browser session.
- Only **one account** exists, so favourites and personal features have not been tested across users.

### Not started (from the roadmap)

| Ref | Item |
| --- | --- |
| D19 | Public transparency page — how predictions are made, in plain language |
| D20 | Job auto-retry and alerts when a scheduled job fails |
| D21 | Data freshness labels everywhere ("as of …") |
| D22 | Responsible-use notice |
| A4 | "My day" panel |
| A5 | Personal bet tracker |
| C14 | AI match preview |
| C15 | Ask the AI across the whole app (currently match-scoped) |
| C16 | Weekly report card |
| A6 | OpenFootball extra leagues + ClubElo history depth |
| C17 | Prediction game |
| C18 | Installable app + push alerts |
| A7 | Polish — leaderboard cache, duplicate players (e.g. Jørgen Strand Larsen), mobile |

### Known data gaps

- 51 finished games have no statistics on either FotMob or ESPN and stay blank
- Unlinked external team names stay null rather than being guessed
- Referee, coach and lower-league coverage is uneven between providers

### Repository status

The GitHub repository is a **one-time copy** of the code (285 files, `.env` deliberately excluded so no keys are in it). It is not a live link: changes made here do not reach it automatically, and pushing to it does not reach this project. Ongoing two-way sync has to be set up through the project's Git settings, which creates its own repository and cannot adopt this one.

---

## Running it locally

```sh
git clone https://github.com/ZdravkoPT/ai-football-intelligence
cd ai-football-intelligence
npm i
npm run dev
```

You need Node.js and a copy of the environment variables (the backend URL and publishable key are not in the repository on purpose).

```sh
npm run lint      # eslint
npm run build     # production build
bun test src/lib/news-content.test.js   # news extraction tests
```

## Built with

TanStack Start v1 (React 19, TypeScript, Vite) · Tailwind CSS v4 · shadcn/ui · Recharts · Lovable Cloud (Postgres, auth, RLS, pg_cron) · Lovable AI Gateway
