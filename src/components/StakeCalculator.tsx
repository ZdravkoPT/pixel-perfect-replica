import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface StakeInputs {
  bankroll: number;
  stake: number;
  kellyFraction: number;
}

/** Bankroll / default-stake controls shared by every bet on the page. */
export function StakeSettings({
  value,
  onChange,
}: {
  value: StakeInputs;
  onChange: (next: StakeInputs) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Stake calculator settings</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="bankroll" className="text-xs">
            Bankroll
          </Label>
          <Input
            id="bankroll"
            type="number"
            min={0}
            step={10}
            value={value.bankroll}
            onChange={(event) => onChange({ ...value, bankroll: Number(event.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="stake" className="text-xs">
            Default stake
          </Label>
          <Input
            id="stake"
            type="number"
            min={0}
            step={1}
            value={value.stake}
            onChange={(event) => onChange({ ...value, stake: Number(event.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kelly" className="text-xs">
            Kelly fraction
          </Label>
          <Input
            id="kelly"
            type="number"
            min={0.05}
            max={1}
            step={0.05}
            value={value.kellyFraction}
            onChange={(event) =>
              onChange({ ...value, kellyFraction: Math.min(1, Math.max(0.05, Number(event.target.value) || 0.25)) })
            }
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Enter the price your bookmaker offers on each bet to compare it with the model's fair odds.
        Kelly staking is capped by the fraction above — a full Kelly stake is very aggressive.
      </p>
    </section>
  );
}

function money(amount: number): string {
  return amount.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

/** Per-bet profit, risk, Kelly stake and fair-vs-market odds comparison. */
export function StakeCalculator({
  probability,
  fairOdds,
  settings,
}: {
  probability: number;
  fairOdds: number;
  settings: StakeInputs;
}) {
  const [bookOdds, setBookOdds] = useState<string>(fairOdds.toFixed(2));
  const [stakeOverride, setStakeOverride] = useState<string>("");

  const price = Number(bookOdds) > 1 ? Number(bookOdds) : fairOdds;
  const stake = stakeOverride === "" ? settings.stake : Math.max(0, Number(stakeOverride) || 0);

  const result = useMemo(() => {
    const profit = stake * (price - 1);
    const edge = probability * price - 1;
    const kellyRaw = price > 1 ? (probability * price - 1) / (price - 1) : 0;
    const kelly = Math.max(0, kellyRaw) * settings.kellyFraction;
    const kellyStake = settings.bankroll * kelly;
    const expectedValue = probability * profit - (1 - probability) * stake;
    const riskOfLoss = 1 - probability;
    const riskLabel = riskOfLoss < 0.3 ? "Low" : riskOfLoss < 0.5 ? "Medium" : "High";
    return { profit, edge, kellyStake, expectedValue, riskOfLoss, riskLabel };
  }, [price, probability, stake, settings.bankroll, settings.kellyFraction]);

  return (
    <div className="mt-3 rounded-md border border-border/60 bg-background/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Bookmaker odds</Label>
          <Input
            type="number"
            min={1.01}
            step={0.01}
            value={bookOdds}
            onChange={(event) => setBookOdds(event.target.value)}
            className="h-8 font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Stake</Label>
          <Input
            type="number"
            min={0}
            step={1}
            placeholder={String(settings.stake)}
            value={stakeOverride}
            onChange={(event) => setStakeOverride(event.target.value)}
            className="h-8 font-mono"
          />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Returns</dt>
          <dd className="font-mono tabular-nums">{money(stake + result.profit)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Profit</dt>
          <dd className="font-mono tabular-nums text-primary">+{money(result.profit)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Expected value</dt>
          <dd
            className={`font-mono tabular-nums ${result.expectedValue >= 0 ? "text-primary" : "text-destructive"}`}
          >
            {result.expectedValue >= 0 ? "+" : ""}
            {money(result.expectedValue)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Kelly stake</dt>
          <dd className="font-mono tabular-nums">{money(result.kellyStake)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="font-mono">
          fair {fairOdds.toFixed(2)} vs book {price.toFixed(2)}
        </Badge>
        <Badge variant={result.edge > 0 ? "default" : "secondary"} className="font-mono">
          {result.edge >= 0 ? "+" : ""}
          {(result.edge * 100).toFixed(1)}% edge
        </Badge>
        <Badge
          variant={result.riskLabel === "Low" ? "secondary" : result.riskLabel === "Medium" ? "outline" : "destructive"}
        >
          {result.riskLabel} risk · {(result.riskOfLoss * 100).toFixed(0)}% chance of losing the stake
        </Badge>
      </div>
    </div>
  );
}
