import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { listNewsSources } from "@/lib/news.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "News source status — Football Intel" },
      { name: "description", content: "Status of every news feed: last successful fetch, last error and article count." },
      { property: "og:title", content: "News source status — Football Intel" },
      { property: "og:description", content: "Status of every news feed: last successful fetch, last error and article count." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SourcesPage,
});

function fmt(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function SourcesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["news-sources"], queryFn: () => listNewsSources() });
  return (
    <AppShell title="News sources" subtitle="Every feed, its last successful fetch and its last error">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((s) => (
            <div key={s.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{s.name}</p>
                <Badge variant="outline" className="text-[10px] uppercase">{s.language}</Badge>
                {s.enabled ? (
                  <Badge variant="outline" className="border-emerald-500/50 text-[10px] text-emerald-500">enabled</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">disabled</Badge>
                )}
                <a href={s.feed_url} target="_blank" rel="noreferrer" className="ml-auto text-xs text-primary hover:underline">
                  Feed ↗
                </a>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                <span>Last success: {fmt(s.last_success_at)}</span>
                <span>Articles in last fetch: {s.last_count ?? "—"}</span>
                <span>Last error: {s.last_error_at ? `${fmt(s.last_error_at)} — ${s.last_error ?? ""}` : "none"}</span>
              </div>
            </div>
          ))}
          {(data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No news sources configured yet.
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
