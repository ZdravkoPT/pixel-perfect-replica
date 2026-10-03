CREATE TABLE public.odds_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  bookmaker text NOT NULL,
  market text NOT NULL,
  selection text NOT NULL,
  line numeric,
  price numeric NOT NULL,
  phase text NOT NULL DEFAULT 'pre',
  captured_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'the_odds_api'
);
CREATE INDEX odds_snapshots_match_idx ON public.odds_snapshots(match_id, market, captured_at DESC);
GRANT SELECT ON public.odds_snapshots TO anon, authenticated;
GRANT ALL ON public.odds_snapshots TO service_role;
ALTER TABLE public.odds_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Odds are public" ON public.odds_snapshots FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.team_xg (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  xg numeric,
  xg_against numeric,
  source text NOT NULL DEFAULT 'fotmob',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, team_id)
);
GRANT SELECT ON public.team_xg TO anon, authenticated;
GRANT ALL ON public.team_xg TO service_role;
ALTER TABLE public.team_xg ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xG is public" ON public.team_xg FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.league_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  position integer NOT NULL,
  played integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  goal_diff integer,
  as_of timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, team_id)
);
GRANT SELECT ON public.league_standings TO anon, authenticated;
GRANT ALL ON public.league_standings TO service_role;
ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Standings are public" ON public.league_standings FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.market_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  squad_value_eur bigint,
  source text NOT NULL DEFAULT 'transfermarkt',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, source)
);
GRANT SELECT ON public.market_values TO anon, authenticated;
GRANT ALL ON public.market_values TO service_role;
ALTER TABLE public.market_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Market values are public" ON public.market_values FOR SELECT TO anon, authenticated USING (true);