CREATE TABLE public.news_sources (
  id text PRIMARY KEY, name text NOT NULL, feed_url text NOT NULL, language text NOT NULL,
  enabled boolean NOT NULL DEFAULT true, last_success_at timestamptz, last_error_at timestamptz,
  last_error text, last_count integer, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.news_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text NOT NULL REFERENCES public.news_sources(id),
  canonical_url text NOT NULL UNIQUE, title text NOT NULL, summary text, language text NOT NULL,
  published_at timestamptz, ingested_at timestamptz NOT NULL DEFAULT now(),
  team_ids uuid[] NOT NULL DEFAULT '{}', category text, status text, importance integer, impact text,
  story_key text, analyzed_at timestamptz);
CREATE INDEX ON public.news_articles (published_at DESC);
CREATE INDEX ON public.news_articles USING gin (team_ids);
GRANT SELECT ON public.news_sources, public.news_articles TO anon, authenticated;
GRANT ALL ON public.news_sources, public.news_articles TO service_role;
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON public.news_sources FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read" ON public.news_articles FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.news_sources (id, name, feed_url, language) VALUES
 ('bbc','BBC Sport Football','https://feeds.bbci.co.uk/sport/football/rss.xml','en'),
 ('guardian','The Guardian Football','https://www.theguardian.com/football/rss','en'),
 ('sky','Sky Sports Football','https://www.skysports.com/rss/12040','en'),
 ('sportal','Sportal.bg','https://www.sportal.bg/rss/','bg'),
 ('gong','Gong.bg','https://gong.bg/rss','bg'),
 ('blitz','Blitz Sport','https://blitz.bg/rss/sport','bg');