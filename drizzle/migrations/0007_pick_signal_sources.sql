ALTER TABLE public.ai_bet_log ADD COLUMN IF NOT EXISTS signals jsonb;
COMMENT ON COLUMN public.ai_bet_log.signals IS 'Per-source probabilities that backed the pick: [{name, p}]';