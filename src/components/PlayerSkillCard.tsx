import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export interface PlayerAttributes {
  overall: number | null;
  attacking: number | null;
  technical: number | null;
  creativity: number | null;
  defending: number | null;
  physical: number | null;
  rating: number | string | null;
  market_value: number | null;
  age: number | null;
  minutes: number | null;
  position_group: string | null;
  strengths: unknown;
  weaknesses: unknown;
  updated_at: string;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((row): row is string => typeof row === "string") : [];
}

export function PlayerSkillCard({ attributes }: { attributes: PlayerAttributes | null }) {
  if (!attributes) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        No skill card yet for this player — it is built the next time their club has a fixture in
        the refresh window.
      </div>
    );
  }

  const bars: Array<[string, number | null]> = [
    ["Attacking", attributes.attacking],
    ["Technical", attributes.technical],
    ["Creativity", attributes.creativity],
    ["Defending", attributes.defending],
    ["Physical", attributes.physical],
  ];
  const strengths = list(attributes.strengths);
  const weaknesses = list(attributes.weaknesses);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Skill card</h2>
          <p className="text-xs text-muted-foreground">
            Built from this season's percentile ranks against players in the same position.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {attributes.rating ? (
            <Badge variant="secondary">Form {Number(attributes.rating).toFixed(2)}</Badge>
          ) : null}
          {attributes.overall ? (
            <span className="rounded bg-primary/10 px-3 py-1 font-mono text-lg font-semibold tabular-nums text-primary">
              {attributes.overall}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {bars.map(([label, value]) => (
          <div key={label}>
            <div className="flex items-center justify-between text-xs">
              <span>{label}</span>
              <span className="font-mono tabular-nums text-muted-foreground">{value ?? "—"}</span>
            </div>
            <Progress value={value ?? 0} className="mt-1 h-1.5" />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Strengths</p>
          {strengths.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Not enough ranked data yet.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-xs">
              {strengths.map((row) => (
                <li key={row}>• {row}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Weak spots</p>
          {weaknesses.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Not enough ranked data yet.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-xs">
              {weaknesses.map((row) => (
                <li key={row}>• {row}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        {attributes.age ? `Age ${attributes.age} · ` : ""}
        {attributes.minutes ? `${attributes.minutes} minutes played · ` : ""}
        Updated {new Date(attributes.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}
