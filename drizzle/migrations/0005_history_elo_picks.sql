CREATE TABLE public.historical_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_code text NOT NULL,
  season text NOT NULL,
  match_date date NOT NULL,
  home_name text NOT NULL,
  away_name text NOT NULL,
  home_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  away_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  home_goals integer NOT NULL,
  away_goals integer NOT NULL,
  home_shots integer, away_shots integer,
  home_sot integer, away_sot integer,
  home_corners integer, away_corners integer,
  home_yellow integer, away_yellow integer,
  home_red integer, away_red integer,
  referee text,
  source text NOT NULL DEFAULT 'football-data.co.uk',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_code, match_date, home_name, away_name)
);
CREATE INDEX historical_results_home_idx ON public.historical_results(home_team_id, match_date DESC);
CREATE INDEX historical_results_away_idx ON public.historical_results(away_team_id, match_date DESC);
GRANT SELECT ON public.historical_results TO anon, authenticated;
GRANT ALL ON public.historical_results TO service_role;
ALTER TABLE public.historical_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "History is public" ON public.historical_results FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.elo_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  name text NOT NULL,
  code text,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  rating numeric NOT NULL,
  rank integer,
  source text NOT NULL,
  as_of timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);
CREATE INDEX elo_ratings_team_idx ON public.elo_ratings(team_id);
GRANT SELECT ON public.elo_ratings TO anon, authenticated;
GRANT ALL ON public.elo_ratings TO service_role;
ALTER TABLE public.elo_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Elo is public" ON public.elo_ratings FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.match_picks_cache (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.match_picks_cache TO anon, authenticated;
GRANT ALL ON public.match_picks_cache TO service_role;
ALTER TABLE public.match_picks_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Picks cache is public" ON public.match_picks_cache FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.ai_bet_log ADD COLUMN IF NOT EXISTS total_corners integer, ADD COLUMN IF NOT EXISTS total_cards integer;

CREATE OR REPLACE FUNCTION private.call_hook(path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, extensions AS $$
declare s text;
begin
  select value into s from private.cron_config where key = 'cron_secret';
  if s is null then return; end if;
  perform net.http_post(
    url := 'https://project--1853f281-bb30-408d-bb3c-488a9a226e46-dev.lovable.app/api/public/hooks/' || path,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || s),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;
REVOKE ALL ON FUNCTION private.call_hook(text) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('match-picks-hourly', '5 * * * *', $$select private.call_hook('match-picks');$$);
SELECT cron.schedule('elo-daily', '10 4 * * *', $$select private.call_hook('elo');$$);
SELECT cron.schedule('history-weekly', '40 4 * * 2', $$select private.call_hook('history');$$);