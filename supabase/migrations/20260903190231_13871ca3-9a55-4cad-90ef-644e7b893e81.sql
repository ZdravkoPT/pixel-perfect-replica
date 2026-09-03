INSERT INTO public.data_sources (id, name, base_url, auth_type, rate_limit_per_min, license, status, priority)
VALUES ('fotmob', 'FotMob Public API', 'https://www.fotmob.com/api/data', 'none', 60, 'unofficial public endpoint', 'active', 1)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, base_url = EXCLUDED.base_url, status = 'active';