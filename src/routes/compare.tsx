import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { comparePlayers, searchPlayers } from "@/lib/intel.functions";
import { FifaCard } from "@/components/FifaCard";

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

type Search = { a?: string; b?: string };

export const Route = createFileRoute("/compare")({
  validateSearch: (search: Record<string, unknown>): Search =>
    mkSearch(
      typeof search["a"] === "string" ? search["a"] : undefined,
      typeof search["b"] === "string" ? search["b"] : undefined,
    ),
  head: () => ({
    meta: [
      { title: "Compare players | Football Intelligence" },
      {
        name: "description",
        content:
          "Compare two players side by side: current season, previous seasons, club history and national-team caps.",
      },
      { property: "og:title", content: "Compare players | Football Intelligence" },
      {
        property: "og:description",
        content: "Side-by-side player comparison across seasons, clubs and caps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComparePage,
});

type Season = Record<string, unknown>;

function mkSearch(a: string | undefined, b: string | undefined): Search {
  const out: Search = {};
  if (a) out.a = a;
  if (b) out.b = b;
  return out;
}

function val(source: Record<string, unknown> | null | undefined, key: string): unknown {
  return source ? source[key] : undefined;
}

function ComparePage() {
  const { a, b } = Route.useSearch();
  const navigate = useNavigate();
  const ids = [a, b].filter((id): id is string => !!id);

  const { data, isLoading } = useQuery({
    queryKey: ["compare-players", a ?? "", b ?? ""],
    queryFn: () => comparePlayers({ data: { playerIds: ids } }),
    enabled: ids.length > 0,
  });

  const slots = data?.players ?? [];

  return (
    <AppShell title="Compare players" subtitle="Current season, previous seasons, clubs and caps side by side.">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Picker
            label="Player A"
            selectedName={slots[0]?.player?.name ?? null}
            onPick={(id) => navigate({ to: "/compare", search: mkSearch(id, b) })}
            onClear={() => navigate({ to: "/compare", search: mkSearch(undefined, b) })}
          />
          <Picker
            label="Player B"
            selectedName={slots[1]?.player?.name ?? null}
            onPick={(id) => navigate({ to: "/compare", search: mkSearch(a, id) })}
            onClear={() => navigate({ to: "/compare", search: mkSearch(a, undefined) })}
          />
        </div>

        {ids.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Pick two players to compare, or select them from a squad page.
          </div>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading comparison…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {slots.map((slot, index) => (
              <PlayerColumn key={slot.player?.id ?? index} slot={slot} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Picker({
  label,
  selectedName,
  onPick,
  onClear,
}: {
  label: string;
  selectedName: string | null;
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const { data } = useQuery({
    queryKey: ["compare-search", query],
    queryFn: () => searchPlayers({ data: { query, limit: 8 } }),
    enabled: query.trim().length > 1,
    placeholderData: keepPreviousData,
  });

  const rows = (data?.players ?? []) as unknown as Array<{
    id: string;
    player: { id: string; name: string } | null;
    team: { name: string } | null;
  }>;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      {selectedName ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{selectedName}</p>
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            change
          </button>
        </div>
      ) : (
        <>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player…"
            className="mt-2"
          />
          <div className="mt-2 space-y-1">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => row.player && onPick(row.player.id)}
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
              >
                {row.player?.name} · <span className="text-muted-foreground">{row.team?.name ?? "—"}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PlayerColumn({
  slot,
}: {
  slot: {
    player: { id: string; name: string; position: string | null; nationality: string | null } | null;
    membership: { shirt_number: number | null; position: string | null; team: unknown } | null;
    career: Record<string, unknown> | null;
    attributes: Record<string, unknown> | null;
    injury: { kind: string | null; status: string | null } | null;
  };
}) {
  if (!slot.player) return null;
  const career = slot.career ?? {};
  const current = (val(career, "current_season") ?? null) as Season | null;
  const seasons = ((val(career, "seasons") ?? []) as Season[]).slice(0, 6);
  const clubs = ((val(career, "clubs") ?? []) as Season[])
    .filter(
      (club, index, all) =>
        all.findIndex(
          (other) =>
            String(val(other, "team") ?? val(other, "name") ?? "") ===
            String(val(club, "team") ?? val(club, "name") ?? ""),
        ) === index,
    )
    .slice(0, 6);
  const national = (val(career, "national") ?? null) as Record<string, unknown> | null;
  const team = (slot.membership?.team ?? null) as { name?: string } | null;
  const attrs = slot.attributes ?? {};

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div>
        <Link
          to="/players/$playerId"
          params={{ playerId: slot.player.id }}
          className="text-base font-semibold underline-offset-4 hover:underline"
        >
          {slot.player.name}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {team?.name ?? "—"} · {slot.membership?.position ?? slot.player.position ?? "—"} ·{" "}
          {slot.player.nationality ?? "—"}
          {val(career, "market_value_label") ? ` · ${String(val(career, "market_value_label"))}` : ""}
        </p>
        {slot.injury ? (
          <Badge variant="destructive" className="mt-2 text-[10px]">
            {slot.injury.kind ?? slot.injury.status}
          </Badge>
        ) : null}
      </div>

      <FifaCard
        name={slot.player.name}
        position={slot.membership?.position ?? slot.player.position}
        shirt={slot.membership?.shirt_number ?? null}
        compact
        card={
          slot.attributes
            ? {
                overall: num(attrs["overall"]),
                attacking: num(attrs["attacking"]),
                technical: num(attrs["technical"]),
                creativity: num(attrs["creativity"]),
                defending: num(attrs["defending"]),
                physical: num(attrs["physical"]),
                rating: (attrs["rating"] as number | string | null) ?? null,
              }
            : null
        }
      />
      {(team as { id?: string } | null)?.id ? (
        <Link
          to="/teams/$teamId"
          params={{ teamId: (team as { id: string }).id }}
          className="inline-block text-xs text-primary underline-offset-4 hover:underline"
        >
          {team?.name} team stats →
        </Link>
      ) : null}

      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Current season
        </p>
        <p className="mt-1 font-mono text-xs tabular-nums">{seasonLine(current)}</p>
      </div>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Season history
        </p>
        <ul className="mt-1 space-y-1">
          {seasons.length === 0 ? (
            <li className="text-xs text-muted-foreground">No season history stored yet.</li>
          ) : (
            seasons.map((season, index) => (
              <li key={index} className="font-mono text-xs tabular-nums text-muted-foreground">
                {seasonLine(season)}
              </li>
            ))
          )}
        </ul>
      </div>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Clubs</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {clubs.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            clubs.map((club, index) => (
              <Badge key={index} variant="secondary" className="text-[10px]">
                {String(val(club, "team") ?? val(club, "name") ?? "—")}
              </Badge>
            ))
          )}
        </div>
      </div>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          National team
        </p>
        <p className="mt-1 font-mono text-xs tabular-nums">
          {national
            ? `${String(val(national, "team") ?? val(national, "name") ?? "—")} · ${String(val(national, "appearances") ?? val(national, "matches") ?? 0)} caps · ${String(val(national, "goals") ?? 0)}G`
            : "—"}
        </p>
      </div>
    </div>
  );
}

function seasonLine(season: Season | null) {
  if (!season || Object.keys(season).length === 0) return "—";
  const label = String(val(season, "season") ?? val(season, "team") ?? "Season");
  const apps = val(season, "matches") ?? val(season, "appearances") ?? 0;
  const goals = val(season, "goals") ?? 0;
  const assists = val(season, "assists") ?? 0;
  const ratingRaw = val(season, "rating");
  const rating = ratingRaw ? ` · ⌀${Number(ratingRaw).toFixed(2)}` : "";
  return `${label}: ${String(apps)} apps · ${String(goals)}G · ${String(assists)}A${rating}`;
}
