import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export interface PlayerCondition {
  matches_30d: number;
  minutes_30d: number;
  matches_recent: number;
  minutes_recent: number;
  starts_recent: number;
  avg_rating_recent: number | string | null;
  avg_rating_prior: number | string | null;
  rating_trend: number | string | null;
  goals_recent: number;
  assists_recent: number;
  days_since_last_match: number | null;
  minutes_share: number | string | null;
  load_index: number | string | null;
  sharpness: number | string | null;
  availability: string;
  injury: unknown;
  recent_matches: unknown;
  fetched_at: string;
}

interface RecentMatch {
  date?: string;
  opponent?: string;
  competition?: string;
  minutes?: number;
  rating?: number | null;
  started?: boolean;
  goals?: number;
  assists?: number;
}

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recentList(value: unknown): RecentMatch[] {
  return Array.isArray(value) ? (value as RecentMatch[]) : [];
}

export function PlayerConditionPanel({ condition }: { condition: PlayerCondition | null }) {
  if (!condition) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        No condition snapshot yet — it is built the next time this player's club has a fixture in
        the refresh window.
      </div>
    );
  }

  const load = num(condition.load_index);
  const sharpness = num(condition.sharpness);
  const trend = num(condition.rating_trend);
  const share = num(condition.minutes_share);
  const recent = recentList(condition.recent_matches).slice(0, 6);

  const availabilityVariant =
    condition.availability === "available"
      ? "default"
      : condition.availability === "injured"
        ? "destructive"
        : "secondary";

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Condition &amp; match load</h2>
          <p className="text-xs text-muted-foreground">
            Derived only from published minutes and match ratings — no tracking or distance data is
            available from the free feeds.
          </p>
        </div>
        <Badge variant={availabilityVariant as never} className="capitalize">
          {condition.availability}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Fact label="Matches (30 days)" value={String(condition.matches_30d)} />
        <Fact label="Minutes (30 days)" value={`${condition.minutes_30d}′`} />
        <Fact
          label="Starts (recent)"
          value={`${condition.starts_recent}/${condition.matches_recent}`}
        />
        <Fact
          label="Days since last game"
          value={condition.days_since_last_match === null ? "—" : String(condition.days_since_last_match)}
        />
      </div>

      <div className="mt-4 space-y-2">
        <Bar label="Recent load" value={load === null ? null : Math.min(load, 100)} raw={load} />
        <Bar label="Sharpness" value={sharpness} raw={sharpness} />
        <Bar
          label="Share of team minutes"
          value={share === null ? null : share * 100}
          raw={share === null ? null : share * 100}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Form rating {num(condition.avg_rating_recent)?.toFixed(2) ?? "—"} vs{" "}
        {num(condition.avg_rating_prior)?.toFixed(2) ?? "—"} before
        {trend !== null ? ` (${trend > 0 ? "+" : ""}${trend.toFixed(2)})` : ""} ·{" "}
        {condition.goals_recent} goals, {condition.assists_recent} assists in the recent window.
      </p>

      {recent.length > 0 ? (
        <div className="mt-4 space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Last appearances
          </p>
          {recent.map((row, index) => (
            <div
              key={`${row.date ?? index}-${row.opponent ?? index}`}
              className="flex items-center justify-between rounded border border-border px-3 py-1.5 text-xs"
            >
              <span>
                {row.date ? `${row.date} · ` : ""}
                {row.opponent ?? "Unknown opponent"}
                {row.competition ? ` · ${row.competition}` : ""}
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {row.minutes ?? 0}′{row.started ? " · start" : ""}
                {row.rating ? ` · ${Number(row.rating).toFixed(2)}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-4 text-[11px] text-muted-foreground">
        Updated {new Date(condition.fetched_at).toLocaleDateString()}
      </p>
    </div>
  );
}

function Bar({ label, value, raw }: { label: string; value: number | null; raw: number | null }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {raw === null ? "—" : raw.toFixed(0)}
        </span>
      </div>
      <Progress value={value ?? 0} className="mt-1 h-1.5" />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}
