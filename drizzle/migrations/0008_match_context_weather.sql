CREATE TABLE public.match_context (
  match_id uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  venue_name text, city text, country text,
  lat numeric, lon numeric,
  temp_c numeric, precip_mm numeric, wind_kmh numeric,
  away_travel_km numeric,
  weather_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.match_context TO anon, authenticated;
GRANT ALL ON public.match_context TO service_role;
ALTER TABLE public.match_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "match context is public" ON public.match_context FOR SELECT USING (true);
SELECT cron.schedule('match-context-hourly', '50 * * * *', $$select private.call_hook('match-context');$$);