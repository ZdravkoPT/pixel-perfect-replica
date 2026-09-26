import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Cell } from "@/components/CoachDossier";
import { getCoach } from "@/lib/intel.functions";

const coachQuery = (coachId: string) =>
  queryOptions({ queryKey: ["coach", coachId], queryFn: () => getCoach({ data: { coachId } }) });

export const Route = createFileRoute("/coaches/$coachId_/history")({
  head: () => ({
    meta: [
      { title: "Manager career history | Football Intelligence" },
      { name: "description", content: "Full manager career timeline with assistant spells, former clubs, club-by-club record and honours." },
      { property: "og:title", content: "Manager career history | Football Intelligence" },
      { property: "og:description", content: "Career timeline, assistant spells, ex-clubs and achievements." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(coachQuery(params.coachId)),
  component: HistoryPage,
});

type Spell = { kind?: string; team?: string; role?: string; from?: string | null; to?: string | null; active?: boolean; appearances?: number | null; goals?: number | null };
type Rec = { team?: string; from?: string | null; to?: string | null; matches?: number; wins?: number; draws?: number; losses?: number; pointsPerGame?: number | null };
type Ach = { team?: string; competition?: string; won?: string[]; runnerUp?: string[] };
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const isAssistant = (role?: string) => !!role && /assist|caretaker|interim|youth|u\d{2}|reserve/i.test(role);

function HistoryPage() {
  const { coachId } = Route.useParams();
  const { data } = useSuspenseQuery(coachQuery(coachId));
  if (!data.coach) return <AppShell title="Coach not found"><p className="text-sm text-muted-foreground">Not in the database.</p></AppShell>;

  const dossier = data.dossier as { career?: unknown; seasons?: unknown; achievements?: unknown } | null;
  const career = arr<Spell>(dossier?.career);
  const coaching = career.filter((c) => c.kind !== "player").sort((a, b) => String(b.from ?? "").localeCompare(String(a.from ?? "")));
  const head = coaching.filter((c) => !isAssistant(c.role));
  const assistant = coaching.filter((c) => isAssistant(c.role));
  const playing = career.filter((c) => c.kind === "player");
  const records = arr<Rec>(dossier?.seasons);
  const achievements = arr<Ach>(dossier?.achievements);
  const trophies = achievements.reduce((n, a) => n + (a.won?.length ?? 0), 0);

  // Ex-clubs: every club coached, merged with its published record.
  const clubs = new Map<string, { team: string; roles: Set<string>; rec: Rec | null; current: boolean; titles: number }>();
  for (const c of coaching) {
    const key = c.team ?? "Unknown";
    const entry = clubs.get(key) ?? { team: key, roles: new Set<string>(), rec: null, current: false, titles: 0 };
    entry.roles.add(c.role ?? "Head coach");
    entry.current ||= !!c.active;
    clubs.set(key, entry);
  }
  for (const r of records) {
    const e = clubs.get(r.team ?? "");
    if (e) e.rec = r;
  }
  for (const a of achievements) {
    const e = clubs.get(a.team ?? "");
    if (e) e.titles += a.won?.length ?? 0;
  }

  // Fall back to archive spells when no dossier has been imported yet.
  const archiveSpells = (data.spells ?? []) as Array<{ id: string; started_at: string | null; ended_at: string | null; is_current: boolean; team: { id: string; name: string } | null }>;

  return (
    <AppShell title={`${data.coach.name} · career history`} subtitle={data.coach.nationality ?? "Nationality unknown"}>
      <div className="space-y-8">
        <Link to="/coaches/$coachId" params={{ coachId }} className="text-xs text-muted-foreground underline-offset-4 hover:underline">← Manager profile</Link>

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Cell label="Head-coach spells" value={String(head.length || archiveSpells.length)} />
          <Cell label="Assistant / interim" value={String(assistant.length)} />
          <Cell label="Clubs" value={String(clubs.size || archiveSpells.length)} />
          <Cell label="Trophies" value={String(trophies)} />
        </div>

        <section>
          <h2 className="text-sm font-semibold">Career timeline</h2>
          {coaching.length === 0 ? (
            archiveSpells.length ? (
              <ol className="mt-3 space-y-2 border-l border-border pl-4">
                {archiveSpells.map((s) => (
                  <li key={s.id} className="text-xs">
                    <span className="font-medium">{s.team?.name ?? "—"}</span>
                    <span className="ml-2 font-mono text-muted-foreground">{s.started_at ?? "—"} → {s.is_current ? "present" : (s.ended_at ?? "—")}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No career dossier imported yet — it arrives with the next manager refresh.</p>
            )
          ) : (
            <ol className="mt-3 space-y-3 border-l-2 border-primary/40 pl-4">
              {coaching.map((c, i) => (
                <li key={`${c.team}-${c.from}-${i}`} className="relative text-xs">
                  <span className={`absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full ${c.active ? "bg-primary" : "bg-muted-foreground"}`} />
                  <p className="font-mono text-muted-foreground">{c.from ?? "—"} → {c.to ?? (c.active ? "present" : "—")}</p>
                  <p className="font-medium">
                    {c.team ?? "Unknown club"}{" "}
                    <Badge variant={isAssistant(c.role) ? "secondary" : "outline"} className="ml-1 text-[10px]">{c.role ?? "Head coach"}</Badge>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold">Assistant & interim spells</h2>
          {assistant.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">None published.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {assistant.map((c, i) => (
                <div key={i} className="flex justify-between rounded border border-border bg-card px-3 py-2 text-xs">
                  <span><span className="font-medium">{c.team}</span> <span className="text-muted-foreground">· {c.role}</span></span>
                  <span className="font-mono text-muted-foreground">{c.from ?? "—"} → {c.to ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold">Ex-clubs</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {[...clubs.values()].map((c) => (
              <div key={c.team} className="rounded-lg border border-border bg-card p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.team}</span>
                  <span className="flex gap-1">
                    {c.current ? <Badge>current</Badge> : null}
                    {c.titles ? <Badge variant="outline">{c.titles} 🏆</Badge> : null}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">{[...c.roles].join(" · ")}</p>
                {c.rec ? (
                  <div className="mt-2 grid grid-cols-4 gap-1">
                    <Cell label="P" value={String(c.rec.matches ?? 0)} />
                    <Cell label="W" value={String(c.rec.wins ?? 0)} />
                    <Cell label="D/L" value={`${c.rec.draws ?? 0}/${c.rec.losses ?? 0}`} />
                    <Cell label="PPG" value={c.rec.pointsPerGame != null ? Number(c.rec.pointsPerGame).toFixed(2) : "—"} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Achievements</h2>
          {achievements.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No honours published.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {achievements.map((a, i) => (
                <div key={i} className="rounded border border-border bg-card p-3 text-xs">
                  <div className="flex justify-between"><span className="font-medium">{a.competition}</span><Badge variant="outline">{a.team}</Badge></div>
                  {a.won?.length ? <p className="mt-1">Won ({a.won.length}): <span className="text-muted-foreground">{a.won.join(", ")}</span></p> : null}
                  {a.runnerUp?.length ? <p className="mt-1">Runner-up: <span className="text-muted-foreground">{a.runnerUp.join(", ")}</span></p> : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {playing.length ? (
          <section>
            <h2 className="text-sm font-semibold">Playing career</h2>
            <div className="mt-3 space-y-1">
              {playing.map((p, i) => (
                <div key={i} className="flex justify-between rounded border border-border bg-card px-3 py-2 text-xs">
                  <span className="font-medium">{p.team}</span>
                  <span className="font-mono text-muted-foreground">{p.from ?? "—"} → {p.to ?? "—"}{p.appearances ? ` · ${p.appearances} apps` : ""}{p.goals ? ` · ${p.goals}G` : ""}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
