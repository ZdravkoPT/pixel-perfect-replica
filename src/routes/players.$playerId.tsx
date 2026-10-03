import { PlayerFormCard } from "@/components/PlayerFormCard";
import { FifaCard, type CardStats } from "@/components/FifaCard";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getPlayerProfile } from "@/lib/intel.functions";
import { PlayerSkillCard } from "@/components/PlayerSkillCard";
import { PlayerConditionPanel } from "@/components/PlayerConditionPanel";

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

  type CareerPayload = {
    preferred_foot: string | null;
    height: string | null;
    contract_end: string | null;
    market_value_label: string | null;
    current_season: {
      season?: string;
      league?: string;
      matches: number | null;
      goals: number | null;
      assists: number | null;
      minutes: number | null;
      rating: number | null;
    } | null;
    seasons: Array<{
      season: string;
      team: string | null;
      appearances: number;
      goals: number;
      assists: number;
      rating: number | null;
    }>;
    clubs: Array<{
      team: string;
      from: string | null;
      to: string | null;
      active: boolean;
      appearances: number;
      goals: number;
      assists: number;
    }>;
    national: Array<{
      team: string;
      from: string | null;
      to: string | null;
      active: boolean;
      caps: number;
      goals: number;
    }>;
  };
  const career = (data.career ?? null) as CareerPayload | null;
  const currentSeason =
    career?.current_season && Object.keys(career.current_season).length > 0
      ? career.current_season
      : null;
  const pastSeasons = (career?.seasons ?? []).slice(0, 6);

  return (
    <AppShell
      title={player.name}
      subtitle={`${team?.name ?? "No current club"} · ${current?.position ?? player.position ?? "—"}`}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 text-xs">
          {team?.id ? (
            <Link
              to="/squads/$teamId"
              params={{ teamId: team.id }}
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              View {team.name} squad
            </Link>
          ) : null}
          <Link
            to="/compare"
            search={{ a: player.id }}
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Compare with another player
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Fact label="Nationality" value={player.nationality ?? "—"} />
          <Fact label="Date of birth" value={player.birth_date ?? "—"} />
          <Fact label="Shirt" value={current?.shirt_number ? `#${current.shirt_number}` : "—"} />
          <Fact
            label="Sample"
            value={`${data.sample.matches} matches · ${data.sample.minutes}′`}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <FifaCard
            name={player.name}
            position={player.position ?? null}
            shirt={current?.shirt_number ?? null}
            card={(data.attributes ?? null) as CardStats | null}
          />
          <PlayerSkillCard attributes={(data.attributes ?? null) as never} />
        </div>
        <p className="-mt-3 text-[11px] text-muted-foreground">
          IQ is derived from the player's technical and creativity percentiles; all other values come
          from provider data.
        </p>

        <PlayerFormCard playerId={playerId} />

        <PlayerConditionPanel condition={(data.condition ?? null) as never} />

        {career ? (
          <section>
            <h2 className="text-sm font-semibold">Career record</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-4">
              <Fact label="Preferred foot" value={career.preferred_foot ?? "—"} />
              <Fact label="Height" value={career.height ?? "—"} />
              <Fact label="Contract until" value={career.contract_end ?? "—"} />
              <Fact label="Market value" value={career.market_value_label ?? "—"} />
            </div>

            {currentSeason ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Season</th>
                      <th className="px-3 py-2 font-medium">Competition</th>
                      <th className="px-3 py-2 text-right font-medium">Apps</th>
                      <th className="px-3 py-2 text-right font-medium">Goals</th>
                      <th className="px-3 py-2 text-right font-medium">Assists</th>
                      <th className="px-3 py-2 text-right font-medium">Minutes</th>
                      <th className="px-3 py-2 text-right font-medium">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border bg-card">
                      <td className="px-3 py-2 font-medium">{currentSeason.season || "Current"}</td>
                      <td className="px-3 py-2">{currentSeason.league}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{currentSeason.matches ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{currentSeason.goals ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{currentSeason.assists ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{currentSeason.minutes ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {currentSeason.rating !== null ? Number(currentSeason.rating).toFixed(2) : "—"}
                      </td>
                    </tr>
                    {pastSeasons.map((season) => (
                      <tr key={season.season} className="border-t border-border bg-card">
                        <td className="px-3 py-2">{season.season}</td>
                        <td className="px-3 py-2 text-muted-foreground">{season.team ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{season.appearances}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{season.goals}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{season.assists}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">—</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {season.rating !== null ? Number(season.rating).toFixed(2) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  Season-by-season record from FotMob, refreshed weekly. The current season is shown
                  against previous seasons for comparison.
                </p>
              </div>
            ) : null}

            {career.national.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  National team
                </h3>
                <ul className="mt-2 space-y-2">
                  {career.national.map((row) => (
                    <li
                      key={`${row.team}-${row.from ?? ""}`}
                      className="flex items-center justify-between rounded border border-border bg-card p-3 text-xs"
                    >
                      <span>
                        {row.team}
                        {row.active ? (
                          <Badge variant="outline" className="ml-2">Active</Badge>
                        ) : null}
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {row.caps} caps · {row.goals} goals
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {career.clubs.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Club career
                </h3>
                <ul className="mt-2 space-y-2">
                  {career.clubs.map((row) => (
                    <li
                      key={`${row.team}-${row.from ?? ""}`}
                      className="flex items-center justify-between rounded border border-border bg-card p-3 text-xs"
                    >
                      <span>
                        {row.team}
                        {row.active ? (
                          <Badge variant="outline" className="ml-2">Current</Badge>
                        ) : null}
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {row.from ?? "?"} – {row.active ? "now" : (row.to ?? "?")} · {row.appearances} apps · {row.goals}g/{row.assists}a
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

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
