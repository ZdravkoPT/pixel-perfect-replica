import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getPlayerProfile } from "@/lib/intel.functions";
import { PlayerSkillCard } from "@/components/PlayerSkillCard";

const profileQuery = (playerId: string) =>
  queryOptions({
    queryKey: ["player-profile", playerId],
    queryFn: () => getPlayerProfile({ data: { playerId } }),
  });

export const Route = createFileRoute("/players/$playerId")({
  head: () => ({
    meta: [
      { title: "Player Profile | Football Intelligence" },
      {
        name: "description",
        content:
          "Per-90 passing, dribbling, defensive and physical averages, availability and model projections for a single player.",
      },
      { property: "og:title", content: "Player Profile | Football Intelligence" },
      {
        property: "og:description",
        content: "Per-90 averages, availability and model projections for a single player.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(profileQuery(params.playerId));
  },
  component: PlayerProfile,
});

function PlayerProfile() {
  const { playerId } = Route.useParams();
  const { data } = useSuspenseQuery(profileQuery(playerId));
  const player = data.player;

  if (!player) {
    return (
      <AppShell title="Player not found">
        <p className="text-sm text-muted-foreground">This player is not in the database.</p>
      </AppShell>
    );
  }

  const current = data.memberships.find((row) => row.is_current) ?? data.memberships[0] ?? null;
  const team = (current?.team ?? null) as { id: string; name: string } | null;
  const max = Math.max(1, ...data.averages.map((row) => row.value));

  return (
    <AppShell
      title={player.name}
      subtitle={`${team?.name ?? "No current club"} · ${current?.position ?? player.position ?? "—"}`}
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <Fact label="Nationality" value={player.nationality ?? "—"} />
          <Fact label="Date of birth" value={player.birth_date ?? "—"} />
          <Fact label="Shirt" value={current?.shirt_number ? `#${current.shirt_number}` : "—"} />
          <Fact
            label="Sample"
            value={`${data.sample.matches} matches · ${data.sample.minutes}′`}
          />
        </div>

        <PlayerSkillCard attributes={(data.attributes ?? null) as never} />

        <section>
          <h2 className="text-sm font-semibold">Per-90 averages</h2>
          {data.averages.length === 0 ? (
            <div className="mt-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No per-match statistics ingested yet.</p>
              <p className="mt-2">
                Passing, dribbling, defensive and recovery averages are computed from per-match
                player statistics. Our current free feeds publish squads, fixtures and officials but
                not per-player match events, so this panel fills in as soon as a statistics feed is
                connected.
              </p>
              <p className="mt-2">
                Physical metrics — top speed, pace and kilometres covered per 90 — come from
                stadium tracking data and are not part of any feed we can reach today, so nothing is
                estimated for them here.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {data.averages.map((row) => (
                <div key={row.key} className="rounded border border-border bg-card p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span>{row.label}</span>
                    <span className="font-mono tabular-nums">
                      {row.value.toFixed(2)} {row.unit}
                    </span>
                  </div>
                  <Progress value={(row.value / max) * 100} className="mt-2 h-1.5" />
                </div>
              ))}
              {data.passAccuracy !== null ? (
                <p className="text-xs text-muted-foreground">
                  Pass accuracy: {(data.passAccuracy * 100).toFixed(1)}%
                </p>
              ) : null}
            </div>
          )}
        </section>

        {data.strengths.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <ListCard title="Strengths" rows={data.strengths} />
            <ListCard title="Weak points" rows={data.weaknesses} />
          </div>
        ) : null}

        <section>
          <h2 className="text-sm font-semibold">Availability</h2>
          {data.injuries.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No active injury or suspension.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {data.injuries.map((row) => (
                <li key={row.id} className="rounded border border-border bg-card p-3 text-xs">
                  <Badge variant="outline" className="mr-2">
                    {row.kind}
                  </Badge>
                  {row.reason ?? "Unavailable"} · {row.status}
                  {row.expected_return ? ` · back ${row.expected_return}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold">Model projections</h2>
          {data.props.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No upcoming fixture projections for this player.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {data.props.map((row) => {
                const match = row.match as { id: string; kickoff_at: string } | null;
                return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded border border-border bg-card p-3 text-xs"
                  >
                    <span>
                      {match ? (
                        <Link
                          to="/matches/$matchId"
                          params={{ matchId: match.id }}
                          className="text-primary hover:underline"
                        >
                          {new Date(match.kickoff_at).toLocaleString()}
                        </Link>
                      ) : (
                        "Fixture"
                      )}
                      <span className="ml-2 text-muted-foreground">
                        {row.market.replace("player_", "")} · {row.selection.replace(/_/g, " ")}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums">
                      {(Number(row.probability) * 100).toFixed(1)}% · fair{" "}
                      {Number(row.fair_odds).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold">Club history in our archive</h2>
          <ul className="mt-2 space-y-2">
            {data.memberships.map((row) => {
              const club = row.team as { id: string; name: string } | null;
              return (
                <li
                  key={row.id}
                  className="flex items-center justify-between rounded border border-border bg-card p-3 text-xs"
                >
                  <span>{club?.name ?? "Unknown club"}</span>
                  <span className="text-muted-foreground">
                    {row.is_current ? "Current" : "Former"}
                    {row.on_loan ? " · on loan" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

function ListCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; label: string; value: number; unit: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {rows.map((row) => (
          <li key={row.key} className="flex justify-between">
            <span>{row.label}</span>
            <span className="font-mono tabular-nums">
              {row.value.toFixed(2)} {row.unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}
