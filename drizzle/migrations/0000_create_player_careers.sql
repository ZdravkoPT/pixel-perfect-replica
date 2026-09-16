CREATE TABLE public.player_careers (
  player_id uuid PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'fotmob',
  name text,
  country text,
  height text,
  preferred_foot text,
  shirt text,
  contract_end text,
  market_value_label text,
  position_description text,
  current_season jsonb NOT NULL DEFAULT '{}'::jsonb,
  seasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  clubs jsonb NOT NULL DEFAULT '[]'::jsonb,
  national jsonb NOT NULL DEFAULT '[]'::jsonb,
  injury jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.player_careers TO anon, authenticated;
GRANT ALL ON public.player_careers TO service_role;

ALTER TABLE public.player_careers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_careers_public_read" ON public.player_careers FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX idx_player_careers_fetched ON public.player_careers (fetched_at DESC);