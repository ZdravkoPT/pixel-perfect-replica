-- Duplicate fixtures created by the secondary provider (no primary-provider id).
CREATE TEMP TABLE dup_matches AS
SELECT id FROM public.matches WHERE NOT (provider_ids ? 'football_data');

ALTER TABLE public.predictions DISABLE TRIGGER predictions_immutable;

DELETE FROM public.prediction_explanations WHERE prediction_id IN (SELECT id FROM public.predictions WHERE match_id IN (SELECT id FROM dup_matches));
DELETE FROM public.prediction_markets WHERE prediction_id IN (SELECT id FROM public.predictions WHERE match_id IN (SELECT id FROM dup_matches));
DELETE FROM public.predictions WHERE match_id IN (SELECT id FROM dup_matches);
DELETE FROM public.backtest_results WHERE match_id IN (SELECT id FROM dup_matches);
DELETE FROM public.player_prop_predictions WHERE match_id IN (SELECT id FROM dup_matches);
DELETE FROM public.lineup_players WHERE lineup_id IN (SELECT id FROM public.lineups WHERE match_id IN (SELECT id FROM dup_matches));
DELETE FROM public.lineups WHERE match_id IN (SELECT id FROM dup_matches);
DELETE FROM public.match_officials WHERE match_id IN (SELECT id FROM dup_matches);
DELETE FROM public.match_sources WHERE match_id IN (SELECT id FROM dup_matches);
DELETE FROM public.team_match_stats WHERE match_id IN (SELECT id FROM dup_matches);
DELETE FROM public.player_match_stats WHERE match_id IN (SELECT id FROM dup_matches);
DELETE FROM public.injuries WHERE match_id IN (SELECT id FROM dup_matches);
DELETE FROM public.match_features WHERE match_id IN (SELECT id FROM dup_matches);
DELETE FROM public.matches WHERE id IN (SELECT id FROM dup_matches);

ALTER TABLE public.predictions ENABLE TRIGGER predictions_immutable;

-- Stray duplicate teams left behind (no primary-provider id, no fixtures).
CREATE TEMP TABLE dup_teams AS
SELECT t.id FROM public.teams t
WHERE NOT (t.provider_ids ? 'football_data')
  AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.home_team_id = t.id OR m.away_team_id = t.id);

DELETE FROM public.team_aliases WHERE team_id IN (SELECT id FROM dup_teams);
DELETE FROM public.squad_memberships WHERE team_id IN (SELECT id FROM dup_teams);
DELETE FROM public.coach_spells WHERE team_id IN (SELECT id FROM dup_teams);
DELETE FROM public.team_ratings WHERE team_id IN (SELECT id FROM dup_teams);
DELETE FROM public.injuries WHERE team_id IN (SELECT id FROM dup_teams);
DELETE FROM public.teams WHERE id IN (SELECT id FROM dup_teams);

-- Stray duplicate competitions with no fixtures left.
DELETE FROM public.seasons s
WHERE s.league_id IN (
  SELECT l.id FROM public.leagues l
  WHERE NOT (l.provider_ids ? 'football_data')
    AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.league_id = l.id)
);
DELETE FROM public.leagues l
WHERE NOT (l.provider_ids ? 'football_data')
  AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.league_id = l.id);