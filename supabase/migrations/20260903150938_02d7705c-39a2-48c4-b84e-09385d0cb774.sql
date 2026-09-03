CREATE OR REPLACE FUNCTION private.run_intel_refresh(with_squads boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
declare s text;
begin
  select value into s from private.cron_config where key = 'cron_secret';
  if s is null then return; end if;
  perform net.http_post(
    url := 'https://project--1853f281-bb30-408d-bb3c-488a9a226e46-dev.lovable.app/api/public/hooks/refresh-intel'
           || case when with_squads then '?squads=1' else '' end,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || s),
    body := '{}'::jsonb
  );
end;
$$;

REVOKE ALL ON FUNCTION private.run_intel_refresh(boolean) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('refresh-intel-6h', '15 */6 * * *', $$select private.run_intel_refresh(false);$$);
SELECT cron.schedule('refresh-squads-weekly', '30 3 * * 1', $$select private.run_intel_refresh(true);$$);