import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type Player = { id: string; name: string; position: string | null } | null;

export interface IntelData {
  lineups: Array<{
    id: string;
    team_id: string;
    formation: string | null;
    is_predicted: boolean;
    confidence: number | null;
    players: Array<{
      player_id: string;
      position: string | null;
      is_starter: boolean;
      start_probability: number | null;
      expected_minutes: number | null;
      player: Player;
    }>;
  }>;
  officials: Array<{ role: string; referee: { id: string; name: string; country: string | null } | null }>;
  injuries: Array<{
    id: string;
    team_id: string | null;
    kind: string;
    reason: string | null;
    status: string;
    expected_return: string | null;
    player: Player;
  }>;
  props: Array<{
    id: string;
    market: string;
    selection: string;
    line: number | null;
    probability: number;
    fair_odds: number;
    expected_minutes: number | null;
    team_id: string | null;
    player: Player;
  }>;
  markets: Array<{ market: string; selection: string; probability: number; fair_odds: number }>;
  refereeProfile: { matches: number; goalsPerGame: number | null; homeWinRate: number | null } | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
}

function Empty({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function LineupsPanel({
  intel,
  homeName,
  awayName,
}: {
  intel: IntelData;
  homeName: string;
  awayName: string;
}) {
  if (intel.lineups.length === 0) {
    return <Empty>No line-up projection yet — run the intelligence refresh once squads are loaded.</Empty>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {intel.lineups.map((lineup) => {
        const name = lineup.team_id === intel.homeTeamId ? homeName : awayName;
        const order: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
        const starters = lineup.players
          .filter((row) => row.is_starter)
          .sort(
            (a, b) =>
              (order[a.position ?? ""] ?? 9) - (order[b.position ?? ""] ?? 9) ||
              Number(b.expected_minutes ?? 0) - Number(a.expected_minutes ?? 0),
          );
        const bench = lineup.players.filter((row) => !row.is_starter);
        return (
          <div key={lineup.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{name}</h3>
              <Badge variant={lineup.is_predicted ? "outline" : "default"}>
                {lineup.is_predicted ? "Projected" : "Confirmed"} · {lineup.formation ?? "—"}
              </Badge>
            </div>
            <ul className="mt-4 space-y-2">
              {starters.map((row) => (
                <li key={row.player_id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary" className="w-10 justify-center text-[10px]">
                      {row.position ?? "—"}
                    </Badge>
                    {row.player?.name ?? "Unknown"}
                  </span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {Math.round(row.expected_minutes ?? 0)}′ ·{" "}
                    {pct(Number(row.start_probability ?? 0))}
                  </span>
                </li>
              ))}
            </ul>
            {bench.length > 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Bench: {bench.slice(0, 8).map((row) => row.player?.name).filter(Boolean).join(", ")}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function InjuriesPanel({
  intel,
  homeName,
  awayName,
}: {
  intel: IntelData;
  homeName: string;
  awayName: string;
}) {
  if (intel.injuries.length === 0) {
    return <Empty>No active injury or suspension records for these squads.</Empty>;
  }
  return (
    <div className="space-y-2">
      {intel.injuries.map((row) => (
        <div key={row.id} className="flex items-center justify-between rounded border border-border bg-card p-3 text-xs">
          <span>
            <Badge variant="outline" className="mr-2">
              {row.team_id === intel.homeTeamId ? homeName : awayName}
            </Badge>
            {row.player?.name ?? "Unknown"} · {row.reason ?? row.kind}
          </span>
          <span className="text-muted-foreground">
            {row.status}
            {row.expected_return ? ` · back ${row.expected_return}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PropsPanel({
  intel,
  market,
  homeName,
  awayName,
}: {
  intel: IntelData;
  market: string;
  homeName: string;
  awayName: string;
}) {
  const rows = intel.props.filter((row) => row.market === market);
  if (rows.length === 0) return <Empty>No player projections available for this market yet.</Empty>;

  return (
    <div className="space-y-2">
      {rows.slice(0, 24).map((row) => (
        <div key={row.id} className="rounded border border-border bg-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {row.player?.name ?? "Unknown"}
              <span className="ml-2 text-muted-foreground">
                {row.team_id === intel.homeTeamId ? homeName : awayName} ·{" "}
                {row.selection.replace(/_/g, " ")}
              </span>
            </span>
            <span className="font-mono tabular-nums">
              {pct(row.probability)} · fair {Number(row.fair_odds).toFixed(2)}
            </span>
          </div>
          <Progress value={row.probability * 100} className="mt-2 h-1.5" />
        </div>
      ))}
    </div>
  );
}

export function TeamMarketPanel({ intel, market }: { intel: IntelData; market: "corners" | "cards" }) {
  const rows = intel.markets.filter((row) => row.market === market);
  if (rows.length === 0) {
    return <Empty>No derived market yet — run the intelligence refresh for this fixture.</Empty>;
  }
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold capitalize">{market} markets</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Model-derived from the match goal expectancy and referee tendencies — not from observed
        {market === "corners" ? " corner" : " card"} counts.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={`${row.market}-${row.selection}`}
            className="flex items-center justify-between rounded border border-border px-3 py-2 text-xs"
          >
            <span>{row.selection.replace(/_/g, " ")}</span>
            <span className="font-mono tabular-nums">
              {pct(Number(row.probability))} · {Number(row.fair_odds).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RefereePanel({ intel }: { intel: IntelData }) {
  const referee = intel.officials.find((row) => row.role === "referee")?.referee ?? null;
  if (!referee) return <Empty>No referee appointment recorded for this fixture.</Empty>;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">{referee.name}</h3>
      <p className="text-xs text-muted-foreground">{referee.country ?? "Unknown nationality"}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Matches in archive" value={String(intel.refereeProfile?.matches ?? 0)} />
        <Stat label="Goals per game" value={intel.refereeProfile?.goalsPerGame?.toFixed(2) ?? "—"} />
        <Stat
          label="Home win rate"
          value={
            intel.refereeProfile?.homeWinRate !== null && intel.refereeProfile?.homeWinRate !== undefined
              ? pct(intel.refereeProfile.homeWinRate)
              : "—"
          }
        />
      </div>
      {intel.officials.length > 1 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Also appointed:{" "}
          {intel.officials
            .filter((row) => row.role !== "referee")
            .map((row) => `${row.referee?.name ?? "?"} (${row.role})`)
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}
