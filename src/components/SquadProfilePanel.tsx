import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { getSquadProfile } from "@/lib/value.functions";

export function SquadProfilePanel({ matchId }: { matchId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["squad-profile", matchId],
    queryFn: () => getSquadProfile({ data: { matchId } }),
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading squad profile…</p>;
  }

  const teams = data?.teams ?? [];
  if (teams.length === 0 || teams.every((team) => team.squadSize === 0)) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        No current squad records for these clubs yet — run a squad sync.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {teams.map((team) => (
        <div key={team.teamId} className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">{team.name}</h3>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <Fact label="Squad" value={String(team.squadSize)} />
            <Fact label="Average age" value={team.averageAge ? team.averageAge.toFixed(1) : "—"} />
            <Fact label="Nations" value={String(team.nationCount)} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Age range {team.youngest ? team.youngest.toFixed(0) : "—"} –{" "}
            {team.oldest ? team.oldest.toFixed(0) : "—"}
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            {team.nations.map((row) => (
              <Badge key={row.nation} variant="secondary" className="text-[10px]">
                {row.nation} · {row.count}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border px-2 py-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}
