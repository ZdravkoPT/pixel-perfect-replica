CREATE TABLE public.match_shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id),
  player_id uuid REFERENCES public.players(id),
  player_name text,
  minute integer,
  x numeric NOT NULL,
  y numeric NOT NULL,
  situation text,
  shot_type text,
  outcome text NOT NULL,
  is_goal boolean NOT NULL DEFAULT false,
  on_target boolean NOT NULL DEFAULT false,
  provider_xg numeric,
  model_xg numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX match_shots_match_idx ON public.match_shots(match_id);
CREATE INDEX match_shots_player_idx ON public.match_shots(player_id);
GRANT SELECT ON public.match_shots TO anon, authenticated;
GRANT ALL ON public.match_shots TO service_role;
ALTER TABLE public.match_shots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shots are public" ON public.match_shots FOR SELECT TO anon, authenticated USING (true);