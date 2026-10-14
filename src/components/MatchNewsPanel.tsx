import { useQuery } from "@tanstack/react-query";
import { getMatchNews, type NewsItem } from "@/lib/news.functions";
import { Badge } from "@/components/ui/badge";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {item.sourceName}
        </span>
        {item.category ? <Badge variant="outline" className="text-[10px]">{item.category.replace("_", " ")}</Badge> : null}
        {item.status === "rumour" ? <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-500">rumour</Badge> : null}
        {(item.importance ?? 0) >= 4 && item.status !== "rumour" ? (
          <Badge className="text-[10px]">important</Badge>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(item.publishedAt)}</span>
      </div>
      <p className="mt-2 text-sm font-medium leading-snug">{item.title}</p>
      {item.impact ? <p className="mt-1 text-xs text-muted-foreground">{item.impact}</p> : null}
      {item.teams.length > 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{item.teams.map((t) => t.name).join(" · ")}</p>
      ) : null}
      {item.alsoIn.length > 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Also in: {item.alsoIn.map((a) => a.source).join(", ")}
        </p>
      ) : null}
    </a>
  );
}

/** News linked to either side of a match, plus a "prediction needs review" note for confirmed big news. */
export function MatchNewsPanel({ matchId }: { matchId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["match-news", matchId],
    queryFn: () => getMatchNews({ data: { matchId } }),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading news…</p>;
  const items = data?.items ?? [];
  const review = data?.needsReview ?? [];
  if (items.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No stored news about either team in the week before kickoff.
      </div>
    );
  return (
    <div className="space-y-3">
      {review.length > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-500">Prediction needs review</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Confirmed news (injury, suspension, manager or line-up) arrived after the pick was made. Picks never change automatically — treat the pre-match pick with extra care.
          </p>
        </div>
      ) : null}
      {items.map((i) => (
        <NewsCard key={i.id} item={i} />
      ))}
    </div>
  );
}
