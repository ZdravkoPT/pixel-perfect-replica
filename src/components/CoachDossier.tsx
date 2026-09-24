import { Badge } from "@/components/ui/badge";

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border px-2 py-1 text-center">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-mono tabular-nums">{value}</p>
    </div>
  );
}

export interface DossierShape {
  career: unknown;
  seasons: unknown;
  achievements: unknown;
  totals: unknown;
  fetched_at: string;
}

interface SpellEntry {
  kind?: string;
  team?: string;
  role?: string;
  from?: string | null;
  to?: string | null;
  active?: boolean;
  appearances?: number | null;
  goals?: number | null;
}

interface ClubRecord {
  team?: string;
  from?: string | null;
  to?: string | null;
  matches?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  winPercentage?: number | null;
  pointsPerGame?: number | null;
}

interface Achievement {
  team?: string;
  competition?: string;
  won?: string[];
  runnerUp?: string[];
}

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function CoachDossier({ dossier }: { dossier: DossierShape | null }) {
  if (!dossier) {
    return (
      <p className="text-xs text-muted-foreground">
        No full career dossier imported for this manager yet — it is fetched on the next
        intelligence refresh for their club.
      </p>
    );
  }

  const career = arr<SpellEntry>(dossier.career);
  const coaching = career.filter((row) => row.kind !== "player");
  const playing = career.filter((row) => row.kind === "player");
  const records = arr<ClubRecord>(dossier.seasons);
  const achievements = arr<Achievement>(dossier.achievements);

  return (
    <div className="space-y-6">
      {coaching.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Coaching career</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Includes assistant-coach and youth roles where they are published.
          </p>
          <div className="mt-3 space-y-2">
            {coaching.map((row, index) => (
              <div
                key={`${row.team ?? index}-${row.from ?? index}-${row.role ?? ""}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-card px-3 py-2 text-xs"
              >
                <span className="font-medium">
                  {row.team ?? "Unknown club"}
                  <span className="ml-2 text-muted-foreground">{row.role ?? "Head coach"}</span>
                </span>
                <span className="text-muted-foreground">
                  {row.from ?? "—"} → {row.to ?? (row.active ? "present" : "—")}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {playing.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Playing career</h2>
          <div className="mt-3 space-y-2">
            {playing.map((row, index) => (
              <div
                key={`p-${row.team ?? index}-${row.from ?? index}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-card px-3 py-2 text-xs"
              >
                <span className="font-medium">{row.team ?? "Unknown club"}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {row.from ?? "—"} → {row.to ?? "—"}
                  {row.appearances ? ` · ${row.appearances} apps` : ""}
                  {row.goals ? ` · ${row.goals} goals` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {records.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Record by club (published)</h2>
          <div className="mt-3 space-y-2">
            {records.map((row, index) => (
              <div
                key={`r-${row.team ?? index}-${row.from ?? index}`}
                className="rounded border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{row.team ?? "Unknown club"}</span>
                  <span className="text-muted-foreground">
                    {row.from ?? "—"} → {row.to ?? "present"}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                  <Cell label="P" value={String(row.matches ?? 0)} />
                  <Cell label="W" value={String(row.wins ?? 0)} />
                  <Cell label="D" value={String(row.draws ?? 0)} />
                  <Cell label="L" value={String(row.losses ?? 0)} />
                  <Cell
                    label="Win %"
                    value={row.winPercentage != null ? `${Number(row.winPercentage).toFixed(0)}%` : "—"}
                  />
                  <Cell
                    label="PPG"
                    value={row.pointsPerGame != null ? Number(row.pointsPerGame).toFixed(2) : "—"}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {achievements.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Honours</h2>
          <div className="mt-3 space-y-2">
            {achievements.map((row, index) => (
              <div
                key={`a-${row.competition ?? index}-${row.team ?? index}`}
                className="rounded border border-border bg-card p-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{row.competition ?? "Competition"}</span>
                  <Badge variant="outline">{row.team ?? "—"}</Badge>
                </div>
                {row.won && row.won.length > 0 ? (
                  <p className="mt-1 text-muted-foreground">Won: {row.won.join(", ")}</p>
                ) : null}
                {row.runnerUp && row.runnerUp.length > 0 ? (
                  <p className="mt-1 text-muted-foreground">
                    Runner-up: {row.runnerUp.join(", ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Dossier updated {new Date(dossier.fetched_at).toLocaleDateString()}. Anything missing is
        simply not published by the free feeds — nothing here is estimated.
      </p>
    </div>
  );
}
