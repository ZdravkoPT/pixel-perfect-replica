import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getMatchFacts } from "@/lib/facts.functions";
import { getLineupForm } from "@/lib/player-stats.functions";
import type { IntelData } from "@/components/IntelPanels";

type PlayerRow = IntelData["lineups"][number]["players"][number];
type FactGroup = { title: string; items: Array<{ title: string; home: string; away: string }> };

const positionBand = (position: string | null) => {
  const value = (position ?? "").toLowerCase();
  if (/goal|^gk|keeper/.test(value)) return 0;
  if (/def|back|^cb|^lb|^rb/.test(value)) return 1;
  if (/mid|^cm|^dm|^am/.test(value)) return 2;
  return 3;
};

const formClass = (s: number) => (s >= 70 ? "bg-primary text-primary-foreground" : s >= 45 ? "bg-muted text-foreground" : "bg-destructive text-destructive-foreground");

function PlayerMarker({ row, form }: { row: PlayerRow; form?: number | undefined }) {
  const name = row.player?.name ?? "Unknown";
  const number = "shirt_number" in row ? row.shirt_number : null;
  return (
    <Link to="/players/$playerId" params={{ playerId: row.player_id }} title={name} className="group flex w-[19%] min-w-0 shrink-0 flex-col items-center gap-1 text-center text-pitch-foreground lg:w-full">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-pitch-foreground/80 bg-pitch-foreground font-sans text-xs font-bold text-pitch-ink shadow-sm transition-transform group-hover:scale-110">
        {typeof number === "number" ? number : name.slice(0, 2).toUpperCase()}
        {typeof form === "number" && <span title={`Form score ${form}`} className={`absolute -top-2 -right-3 rounded-sm px-1 font-mono text-[9px] leading-tight ${formClass(form)}`}>{form}</span>}
      </span>
      <span className="w-full truncate px-0.5 text-[10px] font-semibold leading-tight drop-shadow-sm">{name}</span>
    </Link>
  );
}

function PitchSide({ lineup, reversed, forms }: { lineup: IntelData["lineups"][number] | undefined; reversed?: boolean; forms: Record<string, number> }) {
  const starters = (lineup?.players ?? []).filter((row) => row.is_starter);
  const bands = [0, 1, 2, 3].map((band) => starters.filter((row) => positionBand(row.position ?? row.player?.position ?? null) === band));
  if (starters.length === 0) return <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-pitch-foreground/80">Team sheet not available</div>;
  return (
    <div className={`relative z-10 flex flex-1 flex-col justify-around py-5 lg:flex-row lg:py-2 ${reversed ? "flex-col-reverse lg:flex-row-reverse" : ""}`}>
      {bands.map((players, index) => (
        <div key={index} className="flex min-h-12 items-center justify-evenly gap-1 px-2 lg:w-1/4 lg:flex-col lg:px-0.5">
          {players.map((row) => <PlayerMarker key={row.player_id} row={row} form={forms[row.player_id]} />)}
        </div>
      ))}
    </div>
  );
}

function StatRow({ item }: { item: FactGroup["items"][number] }) {
  const parse = (text: string) => {
    const number = Number.parseFloat(text.trim());
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const home = parse(item.home);
  const away = parse(item.away);
  const total = home !== null && away !== null ? home + away : 0;
  return (
    <div className="border-b border-border/60 py-3 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(100px,1.6fr)_minmax(0,1fr)] items-center gap-2 text-xs">
        <span className="font-mono font-semibold tabular-nums">{item.home}</span>
        <span className="text-center text-muted-foreground">{item.title}</span>
        <span className="text-right font-mono font-semibold tabular-nums">{item.away}</span>
      </div>
      {total > 0 && <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="bg-stat-home" style={{ width: `${100 * (home ?? 0) / total}%` }} />
        <span className="bg-stat-away" style={{ width: `${100 * (away ?? 0) / total}%` }} />
      </div>}
    </div>
  );
}

export function MatchCenter({ matchId, homeName, awayName, intel }: { matchId: string; homeName: string; awayName: string; intel: IntelData }) {
  const [metric, setMetric] = useState<"stats" | "form">("stats");
  const { data, isLoading } = useQuery({ queryKey: ["match-facts", matchId], queryFn: () => getMatchFacts({ data: { matchId } }), refetchInterval: 120_000 });
  const groups = (metric === "stats" ? data?.facts?.statGroups : data?.local?.statGroups) ?? [];
  const homeLineup = intel.lineups.find((row) => row.team_id === intel.homeTeamId);
  const awayLineup = intel.lineups.find((row) => row.team_id === intel.awayTeamId);
  const form = data?.local?.form ?? [];
  const ids = intel.lineups.flatMap((l) => l.players.map((p) => p.player_id)).sort();
  const { data: forms = {} } = useQuery({ queryKey: ["lineup-form", ids.join(",")], queryFn: () => getLineupForm({ data: { playerIds: ids } }), enabled: ids.length > 0, staleTime: 600_000 });
  const insights = [
    ...((data?.local?.info ?? []).filter((item) => /model goal rates|most likely score|model 1x2/i.test(item.label)).map((item) => `${item.label}: ${item.value}`)),
    ...((data?.facts?.info ?? []).filter((item) => /referee|stadium|attendance/i.test(item.label)).map((item) => `${item.label}: ${item.value}`)),
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(210px,0.32fr)]">
      <div className="min-w-0 space-y-6">
        <section aria-label="Match lineups" className="overflow-hidden rounded-md border border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-pitch-header px-4 py-3 text-pitch-foreground">
            <div className="min-w-0 text-xs font-semibold">{homeName} <span className="ml-2 font-mono opacity-75">{homeLineup?.formation ?? "—"}</span></div>
            <div className="min-w-0 text-right text-xs font-semibold"><span className="mr-2 font-mono opacity-75">{awayLineup?.formation ?? "—"}</span>{awayName}</div>
          </div>
          <div className="bg-pitch-header px-4 pb-3 text-center text-[11px] text-pitch-foreground/80">
            {homeLineup?.is_predicted || awayLineup?.is_predicted ? "Projected team sheet — not confirmed" : homeLineup && awayLineup ? "Confirmed team sheets" : "Lineups appear when published"}{Object.keys(forms).length > 0 && " · small number = form score (0–100, last 5 games)"}
          </div>
          <div className="pitch-field relative flex min-h-[610px] flex-col overflow-hidden sm:min-h-[680px] lg:min-h-[440px] lg:flex-row">
            <div className="pitch-outline pointer-events-none absolute inset-4 rounded-sm border-2 border-pitch-lines" />
            <div className="pointer-events-none absolute top-1/2 left-4 right-4 border-t-2 border-pitch-lines lg:top-4 lg:bottom-4 lg:left-1/2 lg:right-auto lg:border-t-0 lg:border-l-2" />
            <div className="pointer-events-none absolute top-1/2 left-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-pitch-lines" />
            <div className="pointer-events-none absolute top-4 left-1/4 right-1/4 h-14 border-x-2 border-b-2 border-pitch-lines lg:top-1/4 lg:bottom-1/4 lg:left-4 lg:right-auto lg:h-auto lg:w-14 lg:border-y-2 lg:border-r-2 lg:border-l-0" />
            <div className="pointer-events-none absolute bottom-4 left-1/4 right-1/4 h-14 border-x-2 border-t-2 border-pitch-lines lg:top-1/4 lg:bottom-1/4 lg:left-auto lg:right-4 lg:h-auto lg:w-14 lg:border-y-2 lg:border-l-2 lg:border-r-0" />
            <PitchSide lineup={homeLineup} forms={forms} />
            <PitchSide lineup={awayLineup} reversed forms={forms} />
          </div>
          <div className="grid grid-cols-2 gap-4 bg-card px-4 py-4 text-xs">
            {[homeLineup, awayLineup].map((lineup, index) => (
              <div key={index} className="min-w-0">
                <p className="font-semibold">{index === 0 ? homeName : awayName}</p>
                <p className="mt-1 text-muted-foreground">Substitutes</p>
                <div className="mt-2 space-y-1.5">{(lineup?.players ?? []).filter((row) => !row.is_starter).map((row) => <Link key={row.player_id} to="/players/$playerId" params={{ playerId: row.player_id }} className="flex items-center justify-between gap-2 hover:text-primary"><span className="truncate">{row.player?.name ?? "Unknown"}</span>{typeof forms[row.player_id] === "number" && <span title="Form score" className={`rounded-sm px-1 font-mono text-[10px] ${formClass(forms[row.player_id])}`}>{forms[row.player_id]}</span>}</Link>)}
                  {!lineup?.players.some((row) => !row.is_starter) && <span className="text-muted-foreground">Not published</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Match statistics" className="border-t border-border pt-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Match statistics</h2>
            <div className="flex gap-1 rounded-md bg-muted p-1" role="group" aria-label="Statistics view">
              <Button size="sm" variant={metric === "stats" ? "secondary" : "ghost"} onClick={() => setMetric("stats")}>Match</Button>
              <Button size="sm" variant={metric === "form" ? "secondary" : "ghost"} onClick={() => setMetric("form")}>Recent form</Button>
            </div>
          </div>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading statistics…</p> : groups.length ? <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            {groups.map((group) => <div key={group.title} className="min-w-0"><h3 className="border-b border-border pb-2 text-center text-xs font-semibold">{group.title}</h3>{group.items.map((item, index) => <StatRow key={`${item.title}-${index}`} item={item} />)}</div>)}
          </div> : <p className="text-sm text-muted-foreground">{metric === "stats" ? "No observed match statistics have been published yet." : "No recent form in the archive yet."}</p>}
        </section>
      </div>
      <aside aria-label="Match insights" className="min-w-0 border-t border-border pt-5 xl:border-t-0 xl:border-l xl:pl-6 xl:pt-0">
        <h2 className="text-sm font-semibold">Insights</h2>
        {form.length === 2 && <div className="mt-5 border-b border-border pb-5 text-xs">
          <p className="mb-3 font-medium">Last five matches</p>
          {[homeName, awayName].map((name, index) => <div key={name} className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-muted-foreground">{name}</span><span className="flex gap-1 font-mono">{(form[index] ?? []).map((result, i) => <span key={i} className={`flex h-5 w-5 items-center justify-center rounded-sm ${result === "W" ? "bg-primary text-primary-foreground" : result === "L" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>{result}</span>)}</span></div>)}
        </div>}
        {insights.length ? <ul className="mt-4 space-y-2">{insights.map((text, index) => <li key={index} className="border-l-2 border-primary bg-muted/50 px-3 py-3 text-xs leading-relaxed">{text}</li>)}</ul> : <p className="mt-4 text-xs text-muted-foreground">No verified match insights available yet.</p>}
      </aside>
    </div>
  );
}