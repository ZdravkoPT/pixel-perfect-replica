CREATE TABLE public.model_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  samples integer NOT NULL DEFAULT 0,
  winner text,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by text NOT NULL DEFAULT 'manual',
  error text
);
GRANT SELECT ON public.model_competitions TO anon, authenticated;
GRANT ALL ON public.model_competitions TO service_role;
ALTER TABLE public.model_competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Model competitions are public" ON public.model_competitions FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX model_competitions_run_at_idx ON public.model_competitions (run_at DESC);