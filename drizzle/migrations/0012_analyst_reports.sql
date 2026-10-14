CREATE TABLE public.analyst_reports (
  match_id uuid PRIMARY KEY,
  reports jsonb NOT NULL,
  evidence jsonb,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.analyst_reports TO anon, authenticated;
GRANT ALL ON public.analyst_reports TO service_role;
ALTER TABLE public.analyst_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analyst reports public read" ON public.analyst_reports FOR SELECT TO anon, authenticated USING (true);