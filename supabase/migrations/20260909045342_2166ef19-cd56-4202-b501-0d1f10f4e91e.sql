CREATE TABLE public.ai_bet_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bet_date DATE NOT NULL,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  fixture TEXT NOT NULL,
  league TEXT,
  kickoff_at TIMESTAMPTZ NOT NULL,
  slip_type TEXT NOT NULL,
  market TEXT NOT NULL,
  pick_code TEXT NOT NULL,
  selection TEXT NOT NULL,
  probability NUMERIC NOT NULL,
  fair_odds NUMERIC NOT NULL,
  facts JSONB,
  opinion TEXT,
  result TEXT NOT NULL DEFAULT 'pending',
  home_score INTEGER,
  away_score INTEGER,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_bet_log_unique UNIQUE (bet_date, match_id, slip_type, pick_code)
);

CREATE INDEX ai_bet_log_date_idx ON public.ai_bet_log (bet_date DESC);
CREATE INDEX ai_bet_log_result_idx ON public.ai_bet_log (result);

GRANT SELECT ON public.ai_bet_log TO anon;
GRANT SELECT ON public.ai_bet_log TO authenticated;
GRANT ALL ON public.ai_bet_log TO service_role;

ALTER TABLE public.ai_bet_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_bet_log_public_read" ON public.ai_bet_log FOR SELECT TO anon, authenticated USING (true);

CREATE TRIGGER ai_bet_log_set_updated_at BEFORE UPDATE ON public.ai_bet_log
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();