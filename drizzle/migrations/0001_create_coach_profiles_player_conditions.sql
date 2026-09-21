CREATE TABLE public.coach_profiles (
  coach_id uuid PRIMARY KEY REFERENCES public.coaches(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'fotmob',
  provider_coach_id text,
  name text,
  nationality text,
  current_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  career jsonb NOT NULL DEFAULT '[]'::jsonb,
  seasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  achievements jsonb NOT NULL DEFAULT '[]'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.coach_profiles TO anon, authenticated;
GRANT ALL ON public.coach_profiles TO service_role;
ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_profiles are public" ON public.coach_profiles FOR SELECT USING (true);

CREATE TABLE public.player_conditions (
  player_id uuid PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'fotmob',
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  matches_30d integer NOT NULL DEFAULT 0,
  minutes_30d integer NOT NULL DEFAULT 0,
  matches_recent integer NOT NULL DEFAULT 0,
  minutes_recent integer NOT NULL DEFAULT 0,
  starts_recent integer NOT NULL DEFAULT 0,
  avg_rating_recent numeric,
  avg_rating_prior numeric,
  rating_trend numeric,
  goals_recent integer NOT NULL DEFAULT 0,
  assists_recent integer NOT NULL DEFAULT 0,
  days_since_last_match integer,
  minutes_share numeric,
  load_index numeric,
  sharpness numeric,
  availability text NOT NULL DEFAULT 'unknown',
  injury jsonb,
  recent_matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.player_conditions TO anon, authenticated;
GRANT ALL ON public.player_conditions TO service_role;
ALTER TABLE public.player_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player_conditions are public" ON public.player_conditions FOR SELECT USING (true);

CREATE INDEX idx_player_conditions_team ON public.player_conditions(team_id);
CREATE INDEX idx_player_conditions_fetched ON public.player_conditions(fetched_at);