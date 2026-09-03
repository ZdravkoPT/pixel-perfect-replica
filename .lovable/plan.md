# Football Intelligence Platform — Phase 1 Foundation

Goal: a working foundation that ingests real fixtures from football-data.org and api-football, stores them in a database, and shows them in a dark, data-dense UI.

Note on the stack: this project runs on TanStack Start (React + TypeScript + Vite + Tailwind + shadcn) with Lovable Cloud as the backend. Backend logic runs as server functions instead of Deno edge functions, and scheduled jobs run via database cron hitting a secured public API route. Everything else in your spec (provider interface, canonical IDs, conflict logging, RLS, TypeScript-only models) is followed as written.

## What gets built in Phase 1

1. **Backend enabled** with your two API keys stored securely (`FOOTBALL_DATA_ORG_KEY`, `API_FOOTBALL_KEY`).
2. **Database — Phase 1 tables only** (rest added per phase):
   - Reference: `leagues`, `seasons`, `teams`, `team_aliases`, `venues`
   - Matches: `matches`, `match_sources`
   - Ops: `data_sources`, `provider_conflicts`, `ingestion_jobs`, `ingestion_errors`
   - Auth/meta: `profiles`, `user_roles` (separate roles table), `favorites`, `audit_logs`
   - Every table: FKs, indexes, `updated_at` triggers, RLS enabled, explicit grants. Public read on reference/match data; auth-only on favorites; admin-only on ops tables.
   - `data_sources` seeded in the migration with the 5 providers and their priorities/rate limits.
3. **Provider Interface**: a normalized `FootballProvider` contract (`getCompetitions`, `getMatches`, `getTeams`, `getPlayers`, `getOdds`, `getLineups`) with two adapters — football-data.org (10 req/min limiter) and api-football (daily quota guard). Unimplemented methods return a typed "not supported in this phase" result.
4. **Canonical IDs & conflicts**: teams/matches store `canonical_id` + `provider_ids` JSONB; alias-based fuzzy resolver matches teams across providers; material disagreements write to `provider_conflicts` instead of overwriting.
5. **Ingestion**: sync fixtures for today +7 days across the top 10 leagues, writing `ingestion_jobs` / `ingestion_errors` rows. Runs on a 30-minute schedule and can be triggered manually from the admin page.
6. **UI shell**: dark theme, sidebar nav, custom design system (no default purple-on-white look).
   - **Dashboard — Today's Matches**: fixture list from `matches`, league filter, search, kickoff times, placeholder slots for value picks and model confidence (filled in Phase 2).
   - **Match Detail**: tabs Overview | AI Prediction | Lineups | Tactics | Players | Stats | Corners | Cards | Referee | Odds | News | H2H — Overview populated, others "coming soon".
   - **Provider Health**: uptime/priority/rate-limit status from `data_sources`, recent `ingestion_jobs`, conflict counts.
   - **Admin / Diagnostics**: trigger sync, view job history and errors.
   - **Auth**: login / register / reset, with protected routes for favorites and admin.

Out of scope for Phase 1 (per your phasing): Elo/Poisson/Dixon-Coles, odds, EV/CLV, player DB, T-60 automation.

## Technical notes

- Ingestion cron: database `pg_cron` calls a signed `/api/public/ingest-fixtures` route; the handler verifies a shared secret before running.
- Rate limiting is enforced server-side per provider with a token-bucket counter persisted in `data_sources`, so limits hold across invocations.
- All provider calls are server-side only; keys are read inside handlers, never in the browser bundle.
- Immutability and timestamp rules are wired into the schema now (timestamp columns present, prediction tables append-only) so Phase 2 can plug in without migration churn.
- Predictions/features tables are deliberately deferred to Phase 2 so their shape matches the actual model outputs.

Phase 1 ships fully working; Phase 2 starts only on your confirmation.
