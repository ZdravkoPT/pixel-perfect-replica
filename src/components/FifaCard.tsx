import { Link } from "@tanstack/react-router";

export interface CardStats {
  overall: number | null;
  attacking: number | null;
  technical: number | null;
  creativity: number | null;
  defending: number | null;
  physical: number | null;
  rating: number | string | null;
}

/** Football IQ = average of creativity and technical percentiles (derived, not a provider value). */
export function footballIq(card: CardStats): number | null {
  const parts = [card.creativity, card.technical].filter((v): v is number => typeof v === "number");
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
}

function tier(overall: number | null) {
  if (overall === null) return "border-border bg-card";
  if (overall >= 80) return "border-primary bg-primary/15";
  if (overall >= 65) return "border-primary/60 bg-primary/5";
  return "border-border bg-muted/40";
}

export function FifaCard({
  name,
  position,
  shirt,
  card,
  playerId,
  compact = false,
}: {
  name: string;
  position: string | null;
  shirt?: number | null;
  card: CardStats | null;
  playerId?: string | null;
  compact?: boolean;
}) {
  const stats: Array<[string, number | null]> = card
    ? [
        ["ATT", card.attacking],
        ["TEC", card.technical],
        ["CRE", card.creativity],
        ["DEF", card.defending],
        ["PHY", card.physical],
        ["IQ", footballIq(card)],
      ]
    : [];
  const body = (
    <div
      className={`flex h-full flex-col rounded-xl border-2 p-3 transition-colors hover:border-primary ${tier(card?.overall ?? null)} ${compact ? "" : "max-w-xs"}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-2xl font-bold leading-none tabular-nums text-primary">
            {card?.overall ?? "—"}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
            {(position ?? "—").slice(0, 3)}
          </p>
        </div>
        <div className="text-right">
          {shirt != null ? <p className="font-mono text-xs text-muted-foreground">#{shirt}</p> : null}
          {card?.rating ? (
            <p className="font-mono text-[10px] text-muted-foreground">
              Form {Number(card.rating).toFixed(2)}
            </p>
          ) : null}
        </div>
      </div>
      <p className="mt-2 truncate text-sm font-semibold" title={name}>
        {name}
      </p>
      {card ? (
        <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1">
          {stats.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between font-mono text-[11px]">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums">{value ?? "—"}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">No ranked data yet</p>
      )}
    </div>
  );
  return playerId ? (
    <Link to="/players/$playerId" params={{ playerId }} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
