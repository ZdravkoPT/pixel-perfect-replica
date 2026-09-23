import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { getCoach } from "@/lib/intel.functions";

const coachQuery = (coachId: string) =>
  queryOptions({
    queryKey: ["coach", coachId],
    queryFn: () => getCoach({ data: { coachId } }),
  });

export const Route = createFileRoute("/coaches/$coachId")({
  head: () => ({
    meta: [
      { title: "Coach Profile | Football Intelligence" },
      {
        name: "description",
        content:
          "Career spells, current club and match-by-match record for a head coach across our covered competitions.",
      },
      { property: "og:title", content: "Coach Profile | Football Intelligence" },
      {
        property: "og:description",
        content: "Career spells, current club and archive record for a head coach.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(coachQuery(params.coachId));
  },
  component: CoachProfile,
});

function CoachProfile() {
  const { coachId } = Route.useParams();
  const { data } = useSuspenseQuery(coachQuery(coachId));
  const coach = data.coach;

  if (!coach) {
    return (
      <AppShell title="Coach not found">
        <p className="text-sm text-muted-foreground">This coach is not in the database.</p>
      </AppShell>
    );
  }

  const current = data.record.find((row) => row.isCurrent) ?? null;
  const career = data.record.reduce(
    (acc, row) => ({
      played: acc.played + row.played,
      won: acc.won + row.won,
      drawn: acc.drawn + row.drawn,
      lost: acc.lost + row.lost,
    }),
    { played: 0, won: 0, drawn: 0, lost: 0 },
  );

  return (
    <AppShell
      title={coach.name}
      subtitle={`${current?.teamName ?? "No current club"} · ${coach.nationality ?? "Unknown nationality"}`}
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <Fact label="Matches in archive" value={String(career.played)} />
          <Fact label="Won" value={String(career.won)} />
          <Fact label="Drawn / lost" value={`${career.drawn} / ${career.lost}`} />
          <Fact
            label="Win rate"
            value={career.played ? `${((career.won / career.played) * 100).toFixed(1)}%` : "—"}
          />
        </div>

        <section>
          <h2 className="text-sm font-semibold">Clubs coached</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Spells come from the official squad feeds; the record is computed from the matches we
            hold for that club inside the spell window.
          </p>
          <div className="mt-3 space-y-2">
            {data.record.map((row) => (
              <div key={row.teamId} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{row.teamName}</span>
                  <Badge variant={row.isCurrent ? "default" : "outline"}>
                    {row.isCurrent ? "Current" : "Former"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.from ?? "start date unknown"} → {row.to ?? (row.isCurrent ? "present" : "—")}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  <Cell label="P" value={String(row.played)} />
                  <Cell label="W" value={String(row.won)} />
                  <Cell label="D" value={String(row.drawn)} />
                  <Cell label="L" value={String(row.lost)} />
                  <Cell label="PPG" value={row.pointsPerGame?.toFixed(2) ?? "—"} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Goals {row.goalsFor}:{row.goalsAgainst}
                </p>
              </div>
            ))}
          </div>
        </section>

        <CoachDossier dossier={data.dossier as DossierShape | null} />
      </div>
    </AppShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border px-2 py-1 text-center">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-mono tabular-nums">{value}</p>
    </div>
  );
}

interface DossierShape {
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

function CoachDossier({ dossier }: { dossier: DossierShape | null }) {
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
