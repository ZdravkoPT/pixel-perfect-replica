import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { FavoriteButton } from "@/components/FavoriteButton";

export interface MatchCardData {
  id: string;
  kickoff_at: string;
  status: string;
  minute: number | null;
  home_score: number | null;
  away_score: number | null;
  league: { id?: string; name: string; country: string | null } | null;
  home: { id?: string; name: string; tla: string | null; crest_url: string | null } | null;
  away: { id?: string; name: string; tla: string | null; crest_url: string | null } | null;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "LIVE" || status === "PAUSED") return "destructive";
  if (status === "FINISHED") return "secondary";
  if (status === "SCHEDULED") return "outline";
  return "default";
}

export function MatchCard({ match }: { match: MatchCardData }) {
  const kickoff = new Date(match.kickoff_at);
  const time = kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const hasScore = match.home_score !== null && match.away_score !== null;
  const isLive = match.status === "LIVE" || match.status === "PAUSED";

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className="group relative block overflow-hidden rounded-lg border border-border/70 bg-card transition-colors hover:border-primary/60"
    >
      <span
        className={`absolute inset-y-0 left-0 w-0.5 ${isLive ? "bg-destructive" : "bg-primary/40 opacity-0 transition-opacity group-hover:opacity-100"}`}
      />

      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <span className="truncate font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {match.league?.name ?? "Unknown league"}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Badge variant={statusVariant(match.status)} className="font-mono text-[10px] tracking-wide">
            {isLive && match.minute !== null ? `${match.minute}'` : match.status}
          </Badge>
          {match.home?.id ? (
            <FavoriteButton entityType="team" entityId={match.home.id} label={match.home.name} />
          ) : null}
        </span>
      </div>

      <div className="px-3 py-2.5">
        <TeamRow
          name={match.home?.name ?? "TBD"}
          crest={match.home?.crest_url ?? null}
          score={hasScore ? match.home_score : null}
        />
        <TeamRow
          name={match.away?.name ?? "TBD"}
          crest={match.away?.crest_url ?? null}
          score={hasScore ? match.away_score : null}
        />
      </div>

      <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
        <span>
          {kickoff.toLocaleDateString([], { day: "2-digit", month: "short" })} · {time}
        </span>
        {match.league?.country ? <span className="truncate">{match.league.country}</span> : null}
      </div>
    </Link>
  );
}

function TeamRow({
  name,
  crest,
  score,
}: {
  name: string;
  crest: string | null;
  score: number | null;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      {crest ? (
        <img src={crest} alt="" loading="lazy" className="h-5 w-5 shrink-0 object-contain" />
      ) : (
        <div className="h-5 w-5 shrink-0 rounded-full bg-muted" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">{name}</span>
      {score !== null ? (
        <span className="font-mono text-base font-semibold tabular-nums">{score}</span>
      ) : null}
    </div>
  );
}
