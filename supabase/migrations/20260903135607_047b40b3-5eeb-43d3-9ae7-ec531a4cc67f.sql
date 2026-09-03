-- PLAYERS
CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id text NOT NULL UNIQUE,
  name text NOT NULL,
  first_name text,
  last_name text,
  position text,
  birth_date date,
  nationality text,
  height_cm integer,
  weight_kg integer,
  photo_url text,
  provider_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.players TO anon, authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players_public_read" ON public.players FOR SELECT USING (true);
CREATE TRIGGER players_updated_at BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_players_name ON public.players (lower(name));

CREATE TABLE public.player_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, normalized_alias)
);
GRANT SELECT ON public.player_aliases TO anon, authenticated;
GRANT ALL ON public.player_aliases TO service_role;
ALTER TABLE public.player_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player_aliases_public_read" ON public.player_aliases FOR SELECT USING (true);
CREATE INDEX idx_player_aliases_norm ON public.player_aliases (normalized_alias);

CREATE TABLE public.squad_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.seasons(id) ON DELETE SET NULL,
  shirt_number integer,
  position text,
  on_loan boolean NOT NULL DEFAULT false,
  is_current boolean NOT NULL DEFAULT true,
  joined_at date,
  left_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, team_id, season_id)
);
GRANT SELECT ON public.squad_memberships TO anon, authenticated;
GRANT ALL ON public.squad_memberships TO service_role;
ALTER TABLE public.squad_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "squad_memberships_public_read" ON public.squad_memberships FOR SELECT USING (true);
CREATE TRIGGER squad_memberships_updated_at BEFORE UPDATE ON public.squad_memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_squad_team ON public.squad_memberships (team_id, is_current);

-- COACHES
CREATE TABLE public.coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id text NOT NULL UNIQUE,
  name text NOT NULL,
  nationality text,
  birth_date date,
  photo_url text,
  provider_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coaches TO anon, authenticated;
GRANT ALL ON public.coaches TO service_role;
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coaches_public_read" ON public.coaches FOR SELECT USING (true);
CREATE TRIGGER coaches_updated_at BEFORE UPDATE ON public.coaches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.coach_spells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  started_at date,
  ended_at date,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, team_id, started_at)
);
GRANT SELECT ON public.coach_spells TO anon, authenticated;
GRANT ALL ON public.coach_spells TO service_role;
ALTER TABLE public.coach_spells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_spells_public_read" ON public.coach_spells FOR SELECT USING (true);

-- INJURIES
CREATE TABLE public.injuries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'injury',
  reason text,
  status text NOT NULL DEFAULT 'out',
  reported_at timestamptz NOT NULL DEFAULT now(),
  expected_return date,
  resolved_at timestamptz,
  source_id text REFERENCES public.data_sources(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, match_id, kind, reason)
);
GRANT SELECT ON public.injuries TO anon, authenticated;
GRANT ALL ON public.injuries TO service_role;
ALTER TABLE public.injuries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "injuries_public_read" ON public.injuries FOR SELECT USING (true);
CREATE TRIGGER injuries_updated_at BEFORE UPDATE ON public.injuries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_injuries_team ON public.injuries (team_id, resolved_at);

-- LINEUPS
CREATE TABLE public.lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  formation text,
  coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
  is_predicted boolean NOT NULL DEFAULT false,
  confidence numeric,
  source_id text REFERENCES public.data_sources(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, team_id, is_predicted)
);
GRANT SELECT ON public.lineups TO anon, authenticated;
GRANT ALL ON public.lineups TO service_role;
ALTER TABLE public.lineups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lineups_public_read" ON public.lineups FOR SELECT USING (true);
CREATE TRIGGER lineups_updated_at BEFORE UPDATE ON public.lineups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.lineup_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id uuid NOT NULL REFERENCES public.lineups(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  position text,
  grid text,
  shirt_number integer,
  is_starter boolean NOT NULL DEFAULT true,
  start_probability numeric,
  expected_minutes numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lineup_id, player_id)
);
GRANT SELECT ON public.lineup_players TO anon, authenticated;
GRANT ALL ON public.lineup_players TO service_role;
ALTER TABLE public.lineup_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lineup_players_public_read" ON public.lineup_players FOR SELECT USING (true);

-- PLAYER MATCH STATS
CREATE TABLE public.player_match_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  minutes integer NOT NULL DEFAULT 0,
  started boolean NOT NULL DEFAULT false,
  goals integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  shots integer NOT NULL DEFAULT 0,
  shots_on_target integer NOT NULL DEFAULT 0,
  passes integer NOT NULL DEFAULT 0,
  key_passes integer NOT NULL DEFAULT 0,
  tackles integer NOT NULL DEFAULT 0,
  fouls_committed integer NOT NULL DEFAULT 0,
  fouls_drawn integer NOT NULL DEFAULT 0,
  yellow_cards integer NOT NULL DEFAULT 0,
  red_cards integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  rating numeric,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);
GRANT SELECT ON public.player_match_stats TO anon, authenticated;
GRANT ALL ON public.player_match_stats TO service_role;
ALTER TABLE public.player_match_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player_match_stats_public_read" ON public.player_match_stats FOR SELECT USING (true);
CREATE INDEX idx_pms_player ON public.player_match_stats (player_id);

-- TEAM MATCH STATS
CREATE TABLE public.team_match_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  is_home boolean NOT NULL,
  corners integer,
  yellow_cards integer,
  red_cards integer,
  fouls integer,
  offsides integer,
  shots integer,
  shots_on_target integer,
  possession numeric,
  passes integer,
  pass_accuracy numeric,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, team_id)
);
GRANT SELECT ON public.team_match_stats TO anon, authenticated;
GRANT ALL ON public.team_match_stats TO service_role;
ALTER TABLE public.team_match_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_match_stats_public_read" ON public.team_match_stats FOR SELECT USING (true);
CREATE INDEX idx_tms_team ON public.team_match_stats (team_id);

-- REFEREES
CREATE TABLE public.referees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id text NOT NULL UNIQUE,
  name text NOT NULL,
  country text,
  provider_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referees TO anon, authenticated;
GRANT ALL ON public.referees TO service_role;
ALTER TABLE public.referees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referees_public_read" ON public.referees FOR SELECT USING (true);
CREATE TRIGGER referees_updated_at BEFORE UPDATE ON public.referees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.match_officials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  referee_id uuid NOT NULL REFERENCES public.referees(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'referee',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, referee_id, role)
);
GRANT SELECT ON public.match_officials TO anon, authenticated;
GRANT ALL ON public.match_officials TO service_role;
ALTER TABLE public.match_officials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "match_officials_public_read" ON public.match_officials FOR SELECT USING (true);

CREATE TABLE public.referee_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id uuid NOT NULL REFERENCES public.referees(id) ON DELETE CASCADE,
  league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL,
  matches integer NOT NULL DEFAULT 0,
  yellow_per_game numeric,
  red_per_game numeric,
  fouls_per_game numeric,
  penalties_per_game numeric,
  home_card_share numeric,
  as_of timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referee_id, league_id)
);
GRANT SELECT ON public.referee_stats TO anon, authenticated;
GRANT ALL ON public.referee_stats TO service_role;
ALTER TABLE public.referee_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referee_stats_public_read" ON public.referee_stats FOR SELECT USING (true);

-- PLAYER PROP PREDICTIONS
CREATE TABLE public.player_prop_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  model_version_id uuid REFERENCES public.model_versions(id) ON DELETE SET NULL,
  market text NOT NULL,
  line numeric,
  selection text NOT NULL,
  probability numeric NOT NULL,
  fair_odds numeric NOT NULL,
  expected_minutes numeric,
  prediction_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id, market, selection, prediction_timestamp)
);
GRANT SELECT ON public.player_prop_predictions TO anon, authenticated;
GRANT ALL ON public.player_prop_predictions TO service_role;
ALTER TABLE public.player_prop_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player_prop_predictions_public_read" ON public.player_prop_predictions FOR SELECT USING (true);
CREATE INDEX idx_props_match ON public.player_prop_predictions (match_id);