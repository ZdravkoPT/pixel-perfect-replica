import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTeamSquad } from "@/lib/intel.functions";
import { FifaCard } from "@/components/FifaCard";
import { CoachDossier, type DossierShape } from "@/components/CoachDossier";

export const Route = createFileRoute("/squads/$teamId")({
  head: () => ({
    meta: [
      { title: "Squad profile | Football Intelligence" },
      {
        name: "description",
        content:
          "Current squad list with positions, shirt numbers, season stats, previous-season comparison and availability.",
      },
      { property: "og:title", content: "Squad profile | Football Intelligence" },
      {
        property: "og:description",
        content: "Squad list with season stats, previous season and availability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SquadPage,
});

const GROUP_ORDER = ["Goalkeeper", "Defender", "Midfielder", "Attacker", "Other"];

function groupOf(position: string | null) {
  const value = (position ?? "").toLowerCase();
  if (value.includes("keep") || value === "gk") return "Goalkeeper";
  if (value.includes("def") || value.includes("back")) return "Defender";
  if (value.includes("mid")) return "Midfielder";
  if (value.includes("att") || value.includes("forward") || value.includes("wing") || value.includes("striker"))
    return "Attacker";
  return "Other";
}

function SquadPage() {
  const { teamId } = Route.useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<"table" | "cards">("table");
  const [showDossier, setShowDossier] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["team-squad", teamId],
    queryFn: () => getTeamSquad({ data: { teamId } }),
  });

  const players = data?.players ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, typeof players>();
    for (const player of players) {
      const key = groupOf(player.position);
      map.set(key, [...(map.get(key) ?? []), player]);
    }
    return GROUP_ORDER.filter((key) => map.has(key)).map((key) => [key, map.get(key)!] as const);
  }, [players]);

  function toggle(playerId: string | null) {
    if (!playerId) return;
    setSelected((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId].slice(-2),
    );
  }

  return (
    <AppShell
      title={data?.team?.name ?? "Squad"}
      subtitle="Current squad with season stats, previous season and availability."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/squads" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            ← All squads
          </Link>
          <span className="text-xs text-muted-foreground">
            Select two players to compare ({selected.length}/2)
          </span>
          <Button
            size="sm"
            disabled={selected.length !== 2}
            onClick={() =>
              navigate({ to: "/compare", search: { a: selected[0]!, b: selected[1]! } })
            }
          >
            Compare selected
          </Button>
          <Link to="/teams/$teamId" params={{ teamId }} className="text-xs text-primary underline-offset-4 hover:underline">
            Team stats →
          </Link>
        </div>

        {data ? (
          <section className="space-y-4 rounded-lg border border-border bg-card/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                Manager:{" "}
                {data.currentManager ? (
                  <Link
                    to="/coaches/$coachId"
                    params={{ coachId: data.currentManager.coachId }}
                    className="underline-offset-4 hover:underline"
                  >
                    {data.currentManager.name}
                  </Link>
                ) : (
                  "not recorded"
                )}
                {data.currentManager ? (
                  <Link
                    to="/coaches/$coachId/history"
                    params={{ coachId: data.currentManager.coachId }}
                    className="ml-3 text-xs font-normal text-primary underline-offset-4 hover:underline"
                  >
                    Career history →
                  </Link>
                ) : null}
              </h2>
              <Button size="sm" variant="outline" onClick={() => setShowDossier((v) => !v)}>
                {showDossier ? "Hide manager dossier" : "Show manager dossier"}
              </Button>
            </div>
            {data.managers.length > 0 ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Club manager history
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.managers.map((m) => (
                    <Link
                      key={`${m.coachId}-${m.from}`}
                      to="/coaches/$coachId"
                      params={{ coachId: m.coachId }}
                      className="rounded border border-border px-2 py-1 text-xs hover:border-primary"
                    >
                      <span className="font-medium">{m.name}</span>
                      <span className="ml-2 font-mono text-muted-foreground">
                        {m.from?.slice(0, 4) ?? "—"}–{m.isCurrent ? "now" : (m.to?.slice(0, 4) ?? "—")}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {showDossier ? <CoachDossier dossier={data.dossier as DossierShape | null} /> : null}
          </section>
        ) : null}

        {!isLoading && players.length > 0 ? (
          <div className="flex gap-2">
            <Button size="sm" variant={view === "table" ? "default" : "outline"} onClick={() => setView("table")}>
              Table
            </Button>
            <Button size="sm" variant={view === "cards" ? "default" : "outline"} onClick={() => setView("cards")}>
              Player cards
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading squad…</p>
        ) : players.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No current squad records for this club yet — run a squad sync from Diagnostics.
          </div>
        ) : view === "cards" ? (
          grouped.map(([group, rows]) => (
            <section key={group} className="space-y-2">
              <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {group} · {rows.length}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[...rows]
                  .sort((a, b) => (b.card?.overall ?? -1) - (a.card?.overall ?? -1))
                  .map((player) => (
                    <FifaCard
                      key={player.membershipId}
                      compact
                      name={player.name}
                      position={player.position}
                      shirt={player.shirt}
                      card={player.card}
                      playerId={player.playerId}
                    />
                  ))}
              </div>
            </section>
          ))
        ) : (
          grouped.map(([group, rows]) => (
            <section key={group} className="space-y-2">
              <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {group} · {rows.length}
              </h2>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Player</th>
                      <th className="px-3 py-2 text-right font-medium">Age</th>
                      <th className="px-3 py-2 text-left font-medium">This season</th>
                      <th className="px-3 py-2 text-left font-medium">Previous</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Compare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((player) => (
                      <tr key={player.membershipId} className="border-t border-border/60">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {player.shirt ?? "—"}
                            </Badge>
                            {player.playerId ? (
                              <Link
                                to="/players/$playerId"
                                params={{ playerId: player.playerId }}
                                className="font-medium underline-offset-4 hover:underline"
                              >
                                {player.name}
                              </Link>
                            ) : (
                              <span className="font-medium">{player.name}</span>
                            )}
                            {player.card?.overall ? (
                              <span className="rounded bg-primary/10 px-1.5 font-mono text-[10px] font-semibold text-primary">
                                {player.card.overall}
                              </span>
                            ) : null}
                            {player.onLoan ? (
                              <Badge variant="outline" className="text-[10px]">
                                loan
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {player.position ?? "—"} · {player.nationality ?? "—"}
                            {player.marketValue ? ` · ${player.marketValue}` : ""}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {player.age ?? "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums">
                          {statLine(player.current)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                          {statLine(player.previous)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {player.availability ? (
                            <Badge variant="destructive" className="text-[10px]">
                              {player.availability.kind ?? player.availability.status}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">Available</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="checkbox"
                            aria-label={`Compare ${player.name}`}
                            checked={!!player.playerId && selected.includes(player.playerId)}
                            onChange={() => toggle(player.playerId)}
                            className="h-4 w-4 accent-[var(--color-primary)]"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}

function statLine(
  stats: {
    season: string;
    apps: number | null;
    goals: number | null;
    assists: number | null;
    minutes: number | null;
    rating: number | null;
  } | null,
) {
  if (!stats) return "—";
  const parts = [
    `${stats.apps ?? 0} apps`,
    `${stats.goals ?? 0}G`,
    `${stats.assists ?? 0}A`,
  ];
  if (stats.minutes) parts.push(`${stats.minutes}'`);
  if (stats.rating) parts.push(`⌀${Number(stats.rating).toFixed(2)}`);
  return `${stats.season}: ${parts.join(" · ")}`;
}
