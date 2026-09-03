
CREATE TABLE public.team_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL,
  rating numeric NOT NULL,
  attack numeric,
  defence numeric,
  matches_played integer NOT NULL DEFAULT 0,
  as_of timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, as_of)
);
CREATE INDEX team_ratings_team_idx ON public.team_ratings(team_id, as_of DESC);
GRANT SELECT ON public.team_ratings TO anon, authenticated;
GRANT ALL ON public.team_ratings TO service_role;
ALTER TABLE public.team_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_ratings_public_read ON public.team_ratings FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.match_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  feature_timestamp timestamptz NOT NULL DEFAULT now(),
  home_elo numeric,
  away_elo numeric,
  elo_diff numeric,
  home_attack numeric,
  away_attack numeric,
  home_defence numeric,
  away_defence numeric,
  home_goals_for_avg numeric,
  home_goals_against_avg numeric,
  away_goals_for_avg numeric,
  away_goals_against_avg numeric,
  home_xg_rolling numeric,
  away_xg_rolling numeric,
  home_form_points numeric,
  away_form_points numeric,
  home_rest_days numeric,
  away_rest_days numeric,
  sample_size integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, feature_timestamp)
);
CREATE INDEX match_features_match_idx ON public.match_features(match_id, feature_timestamp DESC);
GRANT SELECT ON public.match_features TO anon, authenticated;
GRANT ALL ON public.match_features TO service_role;
ALTER TABLE public.match_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY match_features_public_read ON public.match_features FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  trained_at timestamptz NOT NULL DEFAULT now(),
  training_samples integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);
GRANT SELECT ON public.model_versions TO anon, authenticated;
GRANT ALL ON public.model_versions TO service_role;
ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY model_versions_public_read ON public.model_versions FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.model_training_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id uuid REFERENCES public.model_versions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  samples integer NOT NULL DEFAULT 0,
  matches_scored integer NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by text NOT NULL DEFAULT 'manual',
  error text
);
CREATE INDEX model_training_runs_started_idx ON public.model_training_runs(started_at DESC);
GRANT SELECT ON public.model_training_runs TO anon, authenticated;
GRANT ALL ON public.model_training_runs TO service_role;
ALTER TABLE public.model_training_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY model_training_runs_public_read ON public.model_training_runs FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  model_version_id uuid NOT NULL REFERENCES public.model_versions(id) ON DELETE CASCADE,
  feature_id uuid REFERENCES public.match_features(id) ON DELETE SET NULL,
  prediction_timestamp timestamptz NOT NULL DEFAULT now(),
  p_home numeric NOT NULL,
  p_draw numeric NOT NULL,
  p_away numeric NOT NULL,
  lambda_home numeric NOT NULL,
  lambda_away numeric NOT NULL,
  expected_goals numeric NOT NULL,
  p_over_25 numeric,
  p_under_25 numeric,
  p_btts numeric,
  confidence numeric,
  top_scoreline text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, model_version_id, prediction_timestamp)
);
CREATE INDEX predictions_match_idx ON public.predictions(match_id, prediction_timestamp DESC);
GRANT SELECT ON public.predictions TO anon, authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY predictions_public_read ON public.predictions FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.prediction_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES public.predictions(id) ON DELETE CASCADE,
  market text NOT NULL,
  selection text NOT NULL,
  probability numeric NOT NULL,
  fair_odds numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prediction_id, market, selection)
);
CREATE INDEX prediction_markets_prediction_idx ON public.prediction_markets(prediction_id);
GRANT SELECT ON public.prediction_markets TO anon, authenticated;
GRANT ALL ON public.prediction_markets TO service_role;
ALTER TABLE public.prediction_markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY prediction_markets_public_read ON public.prediction_markets FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.prediction_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES public.predictions(id) ON DELETE CASCADE,
  feature text NOT NULL,
  label text NOT NULL,
  value numeric,
  contribution numeric NOT NULL,
  direction text NOT NULL,
  rank integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prediction_id, feature)
);
CREATE INDEX prediction_explanations_prediction_idx ON public.prediction_explanations(prediction_id, rank);
GRANT SELECT ON public.prediction_explanations TO anon, authenticated;
GRANT ALL ON public.prediction_explanations TO service_role;
ALTER TABLE public.prediction_explanations ENABLE ROW LEVEL SECURITY;
CREATE POLICY prediction_explanations_public_read ON public.prediction_explanations FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.backtests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id uuid REFERENCES public.model_versions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running',
  window_from date,
  window_to date,
  samples integer NOT NULL DEFAULT 0,
  accuracy numeric,
  log_loss numeric,
  brier numeric,
  calibration jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  triggered_by text NOT NULL DEFAULT 'manual',
  error text
);
CREATE INDEX backtests_started_idx ON public.backtests(started_at DESC);
GRANT SELECT ON public.backtests TO anon, authenticated;
GRANT ALL ON public.backtests TO service_role;
ALTER TABLE public.backtests ENABLE ROW LEVEL SECURITY;
CREATE POLICY backtests_public_read ON public.backtests FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.backtest_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_id uuid NOT NULL REFERENCES public.backtests(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  kickoff_at timestamptz,
  p_home numeric NOT NULL,
  p_draw numeric NOT NULL,
  p_away numeric NOT NULL,
  actual text NOT NULL,
  predicted text NOT NULL,
  correct boolean NOT NULL,
  log_loss numeric NOT NULL,
  brier numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX backtest_results_backtest_idx ON public.backtest_results(backtest_id);
GRANT SELECT ON public.backtest_results TO anon, authenticated;
GRANT ALL ON public.backtest_results TO service_role;
ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY backtest_results_public_read ON public.backtest_results FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.block_prediction_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'predictions are immutable';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.block_prediction_mutation() FROM public, anon, authenticated;

CREATE TRIGGER predictions_immutable
BEFORE UPDATE OR DELETE ON public.predictions
FOR EACH ROW EXECUTE FUNCTION public.block_prediction_mutation();
