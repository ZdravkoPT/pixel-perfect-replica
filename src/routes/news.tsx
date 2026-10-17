import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { NewsCard } from "@/components/MatchNewsPanel";
import { listNews, listNewsSources, refreshNewsNow } from "@/lib/news.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Newspaper, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "Football news — Football Intel" },
      { name: "description", content: "Latest football news from free sources, tagged by AI: injuries, suspensions, transfers and line-ups, linked to teams and matches." },
      { property: "og:title", content: "Football news — Football Intel" },
      { property: "og:description", content: "Latest football news, AI-tagged and linked to teams and matches." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewsPage,
});

const CATEGORIES = ["injury", "suspension", "transfer", "manager", "lineup", "match_report", "preview", "club_statement", "other"];

function NewsPage() {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [language, setLanguage] = useState<"" | "en" | "bg">("");
  const [category, setCategory] = useState("");
  const [breaking, setBreaking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();

  const { data: sources } = useQuery({ queryKey: ["news-sources"], queryFn: () => listNewsSources() });
  const { data, isLoading } = useQuery({
    queryKey: ["news", q, source, language, category, breaking],
    queryFn: () =>
      listNews({
        data: {
          q: q.trim().length >= 2 ? q.trim() : undefined,
          source: source || undefined,
          language: language || undefined,
          category: category || undefined,
          breaking: breaking || undefined,
        },
      }),
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await refreshNewsNow();
      toast(r.skipped ? "Feeds were refreshed less than 5 minutes ago" : `Fetched feeds — ${r.inserted} new articles`);
      if ("message" in r && r.message) toast.error(r.message);
      await qc.invalidateQueries({ queryKey: ["news"] });
      await qc.invalidateQueries({ queryKey: ["news-sources"] });
      await Promise.all(["news-reader-status", "news-opinion", "team-news-opinion", "analysts"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
    } catch {
      toast.error("Refresh failed — try again later");
    } finally {
      setRefreshing(false);
    }
  };

  const items = data?.items ?? [];

  return (
    <AppShell title="News" subtitle="Headlines from free sources, tagged by AI and linked to teams — nothing invented">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search headlines…"
          className="w-56"
        />
        <select value={source} onChange={(e) => setSource(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          <option value="">All sources</option>
          {(sources ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={language} onChange={(e) => setLanguage(e.target.value as "" | "en" | "bg")} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          <option value="">All languages</option>
          <option value="en">English</option>
          <option value="bg">Български</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replace("_", " ")}</option>
          ))}
        </select>
        <Button variant={breaking ? "default" : "outline"} size="sm" onClick={() => setBreaking((b) => !b)}>
          Breaking
        </Button>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh now
        </Button>
        <Link to="/sources" className="ml-auto text-xs text-primary hover:underline">Source status →</Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading news…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Newspaper className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No articles match these filters yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((i) => (
            <NewsCard key={i.id} item={i} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
