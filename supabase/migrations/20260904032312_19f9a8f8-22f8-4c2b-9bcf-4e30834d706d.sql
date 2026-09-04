CREATE TABLE public.bet_history_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running',
  triggered_by TEXT,
  weeks INTEGER NOT NULL DEFAULT 10,
  threshold NUMERIC NOT NULL DEFAULT 0.55,
  window_from TIMESTAMPTZ,
  window_to TIMESTAMPTZ,
  matches INTEGER NOT NULL DEFAULT 0,
  picks INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  hit_rate NUMERIC,
  expected_hit_rate NUMERIC,
  roi_fair NUMERIC,
  roi_market NUMERIC,
  log_loss NUMERIC,
  brier NUMERIC,
  by_market JSONB NOT NULL DEFAULT '[]'::jsonb,
  weekly JSONB NOT NULL DEFAULT '[]'::jsonb,
  calibration JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error TEXT
);

CREATE TABLE public.bet_history_picks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.bet_history_runs(id) ON DELETE CASCADE,
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  kickoff_at TIMESTAMPTZ NOT NULL,
  fixture TEXT NOT NULL,
  market TEXT NOT NULL,
  selection TEXT NOT NULL,
  probability NUMERIC NOT NULL,
  fair_odds NUMERIC NOT NULL,
  won BOOLEAN NOT NULL,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX bet_history_picks_run_idx ON public.bet_history_picks(run_id, kickoff_at DESC);
CREATE INDEX bet_history_runs_started_idx ON public.bet_history_runs(started_at DESC);

GRANT SELECT ON public.bet_history_runs TO anon;
GRANT SELECT ON public.bet_history_runs TO authenticated;
GRANT ALL ON public.bet_history_runs TO service_role;
GRANT SELECT ON public.bet_history_picks TO anon;
GRANT SELECT ON public.bet_history_picks TO authenticated;
GRANT ALL ON public.bet_history_picks TO service_role;

ALTER TABLE public.bet_history_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_history_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bet history runs are public" ON public.bet_history_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Bet history picks are public" ON public.bet_history_picks FOR SELECT TO anon, authenticated USING (true);