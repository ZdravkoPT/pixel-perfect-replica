CREATE TABLE public.player_attributes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references public.players(id) on delete cascade,
  source_id text,
  provider_player_id text,
  position_group text,
  overall integer,
  attacking integer,
  technical integer,
  creativity integer,
  defending integer,
  physical integer,
  rating numeric,
  market_value bigint,
  age integer,
  minutes integer,
  traits jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  weaknesses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX player_attributes_overall_idx ON public.player_attributes (overall DESC);
GRANT SELECT ON public.player_attributes TO anon;
GRANT SELECT ON public.player_attributes TO authenticated;
GRANT ALL ON public.player_attributes TO service_role;
ALTER TABLE public.player_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player_attributes_public_read" ON public.player_attributes FOR SELECT USING (true);
CREATE TRIGGER player_attributes_updated_at BEFORE UPDATE ON public.player_attributes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();