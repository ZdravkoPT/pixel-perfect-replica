import { Badge } from "@/components/ui/badge";

export interface PredictionRow {
  id: string;
  prediction_timestamp: string;
  p_home: number;
  p_draw: number;
  p_away: number;
  lambda_home: number;
  lambda_away: number;
  expected_goals: number;
  p_over_25: number | null;
  p_under_25: number | null;
  p_btts: number | null;
  confidence: number | null;
  top_scoreline: string | null;
}

export interface MarketRow {
  market: string;
  selection: string;
  probability: number;
  fair_odds: number;
}

export interface ExplanationRow {
  feature: string;
  label: string;
  value: number | null;
  contribution: number;
  direction: string;
  rank: number;
}

export interface ModelRow {
  name: string;
  kind: string;
  version: number;
  trained_at: string;
  training_samples: number;
}

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? "–" : `${(Number(value) * 100).toFixed(1)}%`;

export function PredictionPanel({
  prediction,
  markets,
  explanations,
  model,
  homeName,
  awayName,
}: {
  prediction: PredictionRow | null;
  markets: MarketRow[];
  explanations: ExplanationRow[];
  model: ModelRow | null;
  homeName: string;
  awayName: string;
}) {
  if (!prediction) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No prediction stored for this fixture yet. An admin can generate predictions from
        Diagnostics.
      </p>
    );
  }

  const outcomes = [
    { label: homeName, probability: Number(prediction.p_home), key: "home" },
    { label: "Draw", probability: Number(prediction.p_draw), key: "draw" },
    { label: awayName, probability: Number(prediction.p_away), key: "away" },
  ];
  const best = outcomes.reduce((a, b) => (b.probability > a.probability ? b : a));
  const grouped = markets.reduce<Record<string, MarketRow[]>>((acc, row) => {
    (acc[row.market] ??= []).push(row);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Model pick: {best.label}</h3>
            <p className="text-xs text-muted-foreground">
              {model ? `${model.name} v${model.version} · ${model.training_samples} training matches` : ""}
            </p>
          </div>
          <Badge variant="outline">
            Confidence {pct(prediction.confidence)}
          </Badge>
        </div>

        <div className="mt-4 space-y-2">
          {outcomes.map((outcome) => (
            <div key={outcome.key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="truncate">{outcome.label}</span>
                <span className="font-mono tabular-nums">{pct(outcome.probability)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round(outcome.probability * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
          <div>xG {homeName}: {Number(prediction.lambda_home).toFixed(2)}</div>
          <div>xG {awayName}: {Number(prediction.lambda_away).toFixed(2)}</div>
          <div>Total goals: {Number(prediction.expected_goals).toFixed(2)}</div>
          <div>Most likely score: {prediction.top_scoreline ?? "–"}</div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Generated {new Date(prediction.prediction_timestamp).toLocaleString()} · predictions are
          immutable once stored.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Markets &amp; fair odds</h3>
          <div className="space-y-3">
            {Object.entries(grouped).map(([market, rows]) => (
              <div key={market}>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {market}
                </p>
                <div className="grid gap-1">
                  {rows.map((row) => (
                    <div
                      key={`${market}-${row.selection}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <span>{row.selection}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {pct(row.probability)} · {Number(row.fair_odds).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Why this pick</h3>
          {explanations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No explanation rows stored.</p>
          ) : (
            <div className="space-y-3">
              {explanations.map((item) => {
                const magnitude = Math.min(1, Math.abs(Number(item.contribution)));
                const toHome = item.direction === "home";
                return (
                  <div key={item.feature}>
                    <div className="flex justify-between text-xs">
                      <span>{item.label}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {Number(item.value ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="flex w-1/2 justify-end">
                        {!toHome ? (
                          <div
                            className="h-full rounded-l-full bg-destructive"
                            style={{ width: `${magnitude * 100}%` }}
                          />
                        ) : null}
                      </div>
                      <div className="flex w-1/2">
                        {toHome ? (
                          <div
                            className="h-full rounded-r-full bg-primary"
                            style={{ width: `${magnitude * 100}%` }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground">
                Bars to the right favour {homeName}, to the left {awayName}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
