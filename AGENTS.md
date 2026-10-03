<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

Match-center presentation uses stored confirmed/projected lineup rows and live FotMob facts when available; distinguish observed statistics from archive form and never synthesize missing physical metrics or insights.
- Match picks are computed by `src/lib/match-picks.server.ts` on an hourly cron and stored in `match_picks_cache`; the page reads the cache (recomputes only when stale) so it loads instantly.
- External history/ratings (football-data.co.uk results, eloratings.net/clubelo Elo) are imported into their own tables and linked to our teams via `src/lib/team-resolver.server.ts`; unlinked names stay null rather than guessed.
- Goal-model selection is a weekly walk-forward competition (`src/lib/model-competition.server.ts`) over `historical_results`; the winner's current team ratings in `model_competitions` feed Match Picks as one extra signal — never hardcode a model choice.
- Squad market values are summed from FotMob per-player values (`src/lib/market-values.server.ts`) because Transfermarkt blocks automated access; a club needs 11+ valued current players or stays unvalued.
