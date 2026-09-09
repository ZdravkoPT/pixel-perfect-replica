import { useQuery } from "@tanstack/react-query";
import { getMatchFacts } from "@/lib/facts.functions";
import { Badge } from "@/components/ui/badge";

/** Live match facts (stats, timeline, form, head-to-head) from the public feed. */
export function MatchFactsPanel({
  matchId,
  homeName,
  awayName,
}: {
  matchId: string;
  homeName: string;
  awayName: string;
}) {
  const query = useQuery({
    queryKey: ["match-facts", matchId],
    queryFn: () => getMatchFacts({ data: { matchId } }),
    refetchInterval: 120_000,
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading match facts…</p>;
  }

  const facts = query.data?.facts;
  if (!facts) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {query.data?.error ?? "No match facts published for this fixture yet."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {facts.info.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {facts.info.map((row) => (
            <div key={row.label} className="rounded border border-border bg-card p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{row.label}</p>
              <p className="mt-1 text-sm">{row.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {facts.events.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">Timeline</h3>
          <ul className="mt-3 space-y-1 text-xs">
            {facts.events.map((event, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="w-10 font-mono tabular-nums text-muted-foreground">
                  {event.minute === null ? "—" : `${event.minute}'`}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {event.type}
                </Badge>
                <span>{event.player ?? (event.team === "home" ? homeName : awayName)}</span>
                {event.detail ? (
                  <span className="text-muted-foreground">({event.detail})</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {facts.statGroups.map((group) => (
        <section key={group.title} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{homeName}</span>
            <span className="text-sm font-semibold text-foreground">{group.title}</span>
            <span>{awayName}</span>
          </div>
          <ul className="mt-3 space-y-1 text-xs">
            {group.items.map((item, index) => (
              <li key={index} className="grid grid-cols-3 items-center gap-2">
                <span className="font-mono tabular-nums">{item.home}</span>
                <span className="text-center text-muted-foreground">{item.title}</span>
                <span className="text-right font-mono tabular-nums">{item.away}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {facts.h2h.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">Recent head-to-head</h3>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {facts.h2h.slice(0, 8).map((row, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span>
                  {row.home} vs {row.away}
                </span>
                <span className="font-mono tabular-nums">
                  {row.score} · {row.date ? new Date(row.date).toLocaleDateString() : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
