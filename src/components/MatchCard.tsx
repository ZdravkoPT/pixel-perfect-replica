import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";

export interface MatchCardData {
  id: string;
  kickoff_at: string;
  status: string;
  minute: number | null;
  home_score: number | null;
  away_score: number | null;
  league: { name: string; country: string | null } | null;
  home: { name: string; tla: string | null; crest_url: string | null } | null;
  away: { name: string; tla: string | null; crest_url: string | null } | null;
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
  const date = kickoff.toLocaleDateString([], { day: "2-digit", month: "short" });
  const hasScore = match.home_score !== null && match.away_score !== null;

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">
          {match.league?.name ?? "Unknown league"}
          {match.league?.country ? ` · ${match.league.country}` : ""}
        </span>
        <Badge variant={statusVariant(match.status)} className="shrink-0">
          {match.status === "LIVE" && match.minute !== null ? `${match.minute}'` : match.status}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamSide name={match.home?.name ?? "TBD"} crest={match.home?.crest_url ?? null} />
        <div className="text-center">
          {hasScore ? (
            <div className="font-mono text-lg font-semibold tabular-nums">
              {match.home_score} – {match.away_score}
            </div>
          ) : (
            <div className="font-mono text-sm font-medium tabular-nums">{time}</div>
          )}
          <div className="text-[11px] text-muted-foreground">{date}</div>
        </div>
        <TeamSide
          name={match.away?.name ?? "TBD"}
          crest={match.away?.crest_url ?? null}
          align="right"
        />
      </div>
    </Link>
  );
}

function TeamSide({
  name,
  crest,
  align = "left",
}: {
  name: string;
  crest: string | null;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}
    >
      {crest ? (
        <img src={crest} alt="" loading="lazy" className="h-6 w-6 shrink-0 object-contain" />
      ) : (
        <div className="h-6 w-6 shrink-0 rounded-full bg-muted" />
      )}
      <span className="truncate text-sm font-medium">{name}</span>
    </div>
  );
}
