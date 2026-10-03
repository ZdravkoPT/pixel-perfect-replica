import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { listMatches } from "@/lib/football.functions";

type M = {
  id: string;
  kickoff_at: string;
  status: string;
  minute: number | null;
  home_score: number | null;
  away_score: number | null;
  league: { name: string } | null;
  home: { name: string } | null;
  away: { name: string } | null;
};

const fixturesQuery = queryOptions({
  queryKey: ["fixtures", 35],
  queryFn: () => listMatches({ data: { days: 35 } }),
  refetchInterval: 30_000,
});

export const Route = createFileRoute("/fixtures")({
  head: () => ({
    meta: [
      { title: "All fixtures & calendar | Football Intelligence" },
      { name: "description", content: "Every upcoming match with live scores, as a list or a month calendar." },
      { property: "og:title", content: "All fixtures & calendar | Football Intelligence" },
      { property: "og:description", content: "Upcoming matches, live scores and a calendar view." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(fixturesQuery),
  errorComponent: ({ error }) => <AppShell title="Fixtures"><p className="text-sm text-destructive">{(error as Error).message}</p></AppShell>,
  notFoundComponent: () => <AppShell title="Fixtures"><p className="text-sm">Not found.</p></AppShell>,
  component: FixturesPage,
});

const LIVE = new Set(["IN_PLAY", "LIVE", "PAUSED", "HALFTIME"]);
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

function Row({ m }: { m: M }) {
  const live = LIVE.has(m.status);
  const done = m.status === "FINISHED";
  return (
    <Link to="/matches/$matchId" params={{ matchId: m.id }} className="flex items-center gap-3 rounded border border-border bg-card px-3 py-2 text-xs hover:border-primary">
      <span className="w-12 font-mono text-muted-foreground">
        {live ? <span className="animate-pulse text-primary">{m.minute ?? "LIVE"}'</span> : new Date(m.kickoff_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="flex-1 truncate">{m.home?.name ?? "—"} <span className="text-muted-foreground">vs</span> {m.away?.name ?? "—"}</span>
      <span className="font-mono tabular-nums">{live || done ? `${m.home_score ?? 0}–${m.away_score ?? 0}` : ""}</span>
      <span className="hidden w-40 truncate text-right text-muted-foreground sm:block">{m.league?.name}</span>
    </Link>
  );
}

function FixturesPage() {
  const { data } = useSuspenseQuery(fixturesQuery);
  const matches = (data.matches ?? []) as unknown as M[];
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const byDay = useMemo(() => {
    const map = new Map<string, M[]>();
    for (const m of matches) { const k = dayKey(m.kickoff_at); map.set(k, [...(map.get(k) ?? []), m]); }
    return map;
  }, [matches]);
  const live = matches.filter((m) => LIVE.has(m.status));

  const cells = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - ((month.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);

  return (
    <AppShell title="Fixtures" subtitle={`${matches.length} matches in the next 5 weeks · scores refresh every 30s`}>
      <div className="space-y-6">
        <div className="flex gap-2">
          {(["list", "calendar"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded border px-3 py-1 font-mono text-xs uppercase ${view === v ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{v}</button>
          ))}
        </div>

        {live.length ? (
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Badge>Live</Badge> {live.length} in play</h2>
            <div className="mt-2 space-y-1">{live.map((m) => <Row key={m.id} m={m} />)}</div>
          </section>
        ) : null}

        {view === "list" ? (
          [...byDay.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · {list.length}
              </h2>
              <div className="mt-2 space-y-1">{list.map((m) => <Row key={m.id} m={m} />)}</div>
            </section>
          ))
        ) : (
          <section>
            <div className="flex items-center justify-between">
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>← Prev</button>
              <h2 className="text-sm font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>Next →</button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center font-mono text-[10px] uppercase text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((d) => {
                const k = d.toLocaleDateString("en-CA");
                const count = byDay.get(k)?.length ?? 0;
                const inMonth = d.getMonth() === month.getMonth();
                return (
                  <button key={k} type="button" disabled={!count} onClick={() => setSelected(k)}
                    className={`h-16 rounded border p-1 text-left text-xs ${selected === k ? "border-primary" : "border-border"} ${inMonth ? "bg-card" : "opacity-40"} ${count ? "hover:border-primary" : ""}`}>
                    <span className="font-mono">{d.getDate()}</span>
                    {count ? <span className="mt-1 block font-mono text-[10px] text-primary">{count} match{count > 1 ? "es" : ""}</span> : null}
                  </button>
                );
              })}
            </div>
            {selected ? (
              <div className="mt-4 space-y-1">
                <h3 className="text-xs font-semibold">{new Date(selected + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h3>
                {(byDay.get(selected) ?? []).map((m) => <Row key={m.id} m={m} />)}
              </div>
            ) : <p className="mt-3 text-xs text-muted-foreground">Pick a day to see its matches.</p>}
          </section>
        )}
      </div>
    </AppShell>
  );
}
