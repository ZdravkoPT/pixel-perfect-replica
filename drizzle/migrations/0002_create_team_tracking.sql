CREATE TABLE public.team_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  match_date date NOT NULL,
  opponent text,
  distance_km numeric NOT NULL CHECK (distance_km > 0 AND distance_km < 200),
  minutes numeric NOT NULL DEFAULT 90 CHECK (minutes > 0 AND minutes <= 150),
  source text NOT NULL DEFAULT 'own',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, match_date)
);
GRANT SELECT ON public.team_tracking TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.team_tracking TO authenticated;
GRANT ALL ON public.team_tracking TO service_role;
ALTER TABLE public.team_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tracking is public" ON public.team_tracking FOR SELECT USING (true);
CREATE POLICY "Admins insert tracking" ON public.team_tracking FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update tracking" ON public.team_tracking FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete tracking" ON public.team_tracking FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX team_tracking_team_idx ON public.team_tracking(team_id, match_date DESC);