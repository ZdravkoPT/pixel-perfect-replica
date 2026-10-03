import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { getMatchPicks } from "@/lib/match-picks.functions";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function MatchPicks() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["match-picks"],
    queryFn: () => getMatchPicks(),
    staleTime: 5 * 60_000,
  });
  const [level, setLevel] = useState<"all" | "high">("all");
  const [league, setLeague] = useState("all");

  if (isLoading) return <p className="text-xs text-muted-foreground">Scoring every match…</p>;
  if (error || !data) return <p className="text-xs text-destructive">Match picks could not load.</p>;

  const leagues = [...new Set(data.picks.map((p) => p.league ?? "Other"))].sort();
  const shown = data.picks.filter(
    (p) => (level === "all" || p.confidence === "high") && (league === "all" || (p.league ?? "Other") === league),
  );

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Match picks — one best bet per match</h2>
          <p className="text-xs text-muted-foreground">
            Each pick combines the model, recent results, head-to-head, injuries, player condition, managers,
            shots and rest days. A pick is only made when every available source agrees.
          </p>
          {data.summary ? (
            <p className="mt-1 text-xs">
              Record so far: <span className="font-mono">{data.summary.hits}/{data.summary.picks}</span> won (
              {pct(data.summary.hits / data.summary.picks)}, expected {pct(data.summary.expected)})
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Record starts once the first picks are settled.</p>
          )}
        </div>
        <div className="flex gap-2 text-xs">
          <select className="rounded border border-border bg-background px-2 py-1" value={level} onChange={(e) => setLevel(e.target.value as "all" | "high")}>
            <option value="all">All confidence</option>
            <option value="high">High only</option>
          </select>
          <select className="rounded border border-border bg-background px-2 py-1" value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="all">All leagues</option>
            {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No match clears the bar right now.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((p) => (
            <article key={p.matchId} className="rounded-md border border-border bg-background/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to="/matches/$matchId" params={{ matchId: p.matchId }} className="truncate text-sm font-medium hover:underline">
                    {p.fixture}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">
                    {p.league ?? "—"} · {new Date(p.kickoffAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <Badge variant={p.confidence === "high" ? "default" : "outline"}>{p.confidence}</Badge>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-sm font-semibold">{p.market}: {p.selection}</span>
                <span className="font-mono text-sm tabular-nums">{pct(p.probability)}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {p.reasons.map((r, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">• {r}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      {data.noBets.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">No bet — {data.noBets.length} matches</summary>
          <ul className="mt-2 space-y-1">
            {data.noBets.map((n) => (
              <li key={n.matchId}><span className="font-medium">{n.fixture}</span> <span className="text-muted-foreground">— {n.reason}</span></li>
            ))}
          </ul>
        </details>
      ) : null}

      {data.track.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">How each market has performed (last 10 weeks)</summary>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {data.track.map((t) => (
              <div key={t.code} className="flex justify-between font-mono">
                <span>{t.code}</span>
                <span>{t.picks} picks · {pct(t.hitRate)} won vs {pct(t.expected)} expected</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
