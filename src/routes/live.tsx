import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { listLiveMatches } from "@/lib/live.functions";

const liveQuery = queryOptions({
  queryKey: ["live-matches"],
  queryFn: () => listLiveMatches(),
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
});

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live Scores & In-Play Model — Football Intelligence" },
      {
        name: "description",
        content:
          "Live football scores with the minute, in-play model probabilities and fixtures kicking off in the next few hours.",
      },
      { property: "og:title", content: "Live Scores & In-Play Model" },
      {
        property: "og:description",
        content: "Auto-refreshing live scores and in-play win probabilities.",
      },
    ],
  }),
  component: LivePage,
});

type Row = {
  id: string;
  kickoff_at: string;
  status: string;
  minute: number | null;
  home_score: number | null;
  away_score: number | null;
  league: { name: string } | null;
  home: { name: string; crest_url: string | null } | null;
  away: { name: string; crest_url: string | null } | null;
};

function LivePage() {
  const { data, isFetching } = useQuery(liveQuery);

  const live = (data?.live ?? []) as unknown as Row[];
  const upcoming = (data?.upcoming ?? []) as unknown as Row[];
  const finished = (data?.finished ?? []) as unknown as Row[];
  const probs = new Map(
    (data?.predictions ?? []).map((p) => [p.match_id, p] as const),
  );

  return (
    <AppShell
      title="Live"
      subtitle={`${live.length} in play · refreshes automatically every 30 seconds${
        isFetching ? " · updating…" : ""
      }`}
    >
      <Section title="In play" empty="Nothing is being played right now.">
        {live.map((match) => (
          <LiveRow key={match.id} match={match} prediction={probs.get(match.id) ?? null} />
        ))}
      </Section>

      <Section title="Kicking off soon" empty="No kick-offs in the next few hours.">
        {upcoming.map((match) => (
          <LiveRow key={match.id} match={match} prediction={null} />
        ))}
      </Section>

      <Section title="Just finished" empty="No matches finished recently.">
        {finished.map((match) => (
          <LiveRow key={match.id} match={match} prediction={null} />
        ))}
      </Section>
    </AppShell>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h2>
      {children.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card">
          {children}
        </div>
      )}
    </section>
  );
}

function LiveRow({
  match,
  prediction,
}: {
  match: Row;
  prediction: { p_home: number; p_draw: number; p_away: number } | null;
}) {
  const kickoff = new Date(match.kickoff_at);
  const isLive = match.status === "LIVE" || match.status === "PAUSED";
  const awaiting = !isLive && match.status !== "FINISHED" && kickoff.getTime() <= Date.now();
  const hasScore = match.home_score !== null && match.away_score !== null;

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 transition-colors hover:bg-accent/40"
    >
      <span className="flex w-16 shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        {isLive ? (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
        ) : null}
        {isLive && match.minute !== null
          ? `${match.minute}'`
          : match.status === "FINISHED"
            ? "FT"
            : kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>

      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {match.home?.name ?? "TBD"} <span className="text-muted-foreground">v</span>{" "}
        {match.away?.name ?? "TBD"}
      </span>

      <span className="font-mono text-sm font-semibold tabular-nums">
        {hasScore ? `${match.home_score} – ${match.away_score}` : "–"}
      </span>

      <span className="hidden w-40 shrink-0 truncate font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:block">
        {match.league?.name ?? ""}
      </span>

      {prediction ? (
        <span className="font-mono text-[11px] text-muted-foreground">
          {(prediction.p_home * 100).toFixed(0)}/{(prediction.p_draw * 100).toFixed(0)}/
          {(prediction.p_away * 100).toFixed(0)}
        </span>
      ) : null}

      {awaiting ? (
        <Badge variant="outline" className="font-mono text-[10px]">
          awaiting update
        </Badge>
      ) : null}
    </Link>
  );
}
