import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { getMatchPicks } from "@/lib/match-picks.functions";
import { PickShare } from "@/components/PickShare";

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
            Each pick combines the model, Elo ratings, six seasons of results, head-to-head, injuries, player
            condition, managers, shots, corners, cards, referee and rest days. Picks refresh hourly. A pick is only made when every available source agrees.
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
              {(() => {
                const agree = p.reasons.find((r) => /independent sources agree/.test(r));
                const top = p.reasons.filter((r) => r !== agree && !r.startsWith("Model goal rates")).slice(0, 3);
                const rest = p.reasons.filter((r) => r !== agree && !top.includes(r));
                return (
                  <>
                    <p className="mt-2 text-[11px] font-medium">Why: top 3 reasons</p>
                    <ol className="mt-1 list-decimal space-y-1 pl-4">
                      {top.map((r, i) => <li key={i} className="text-[11px]">{r}</li>)}
                    </ol>
                    {agree ? <p className="mt-2 text-[11px] text-muted-foreground">{agree}</p> : null}
                    {rest.length ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-muted-foreground">All reasons ({rest.length} more)</summary>
                        <ul className="mt-1 space-y-1">{rest.map((r, i) => <li key={i} className="text-[11px] text-muted-foreground">• {r}</li>)}</ul>
                      </details>
                    ) : null}
                    <div className="mt-2 flex justify-end"><PickShare pick={p} top={top} /></div>
                  </>
                );
              })()}
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

      {(data.signalTrack ?? []).length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Which sources are right most often</summary>
          <p className="mt-2 text-muted-foreground">Sources that beat expectations count for more in new picks; weaker ones count for less (needs 20+ settled picks).</p>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {(data.signalTrack ?? []).map((t) => (
              <div key={t.name} className="flex justify-between font-mono">
                <span>{t.name}</span>
                <span>{t.picks} · {pct(t.rightRate)} right vs {pct(t.expected)} · weight ×{t.weight.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {(data.reasonTrack ?? []).length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Which reasons are right most often</summary>
          <p className="mt-2 text-muted-foreground">Reason types with 30+ graded picks nudge new picks up or down (at most 3%).</p>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {(data.reasonTrack ?? []).map((t) => (
              <div key={t.kind} className="flex justify-between gap-2 font-mono">
                <span className="truncate">{t.kind}</span>
                <span className="shrink-0">{t.picks} · {pct(t.hitRate)} vs {pct(t.expected)} · ×{t.factor.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {(data.upsets ?? []).length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Upset radar — {(data.upsets ?? []).length} matches (information, not picks)</summary>
          <ul className="mt-2 space-y-1">
            {(data.upsets ?? []).map((u) => (
              <li key={u.matchId}>
                <Link to="/matches/$matchId" params={{ matchId: u.matchId }} className="font-medium hover:underline">{u.fixture}</Link>{" "}
                <span className="text-muted-foreground">— {u.underdog} win chance {pct(u.winChance)}; usual for this gap {pct(u.usualShare)}, model now {pct(u.modelShare)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
