import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProviderId } from "./types";

export class RateLimiter {
  constructor(private readonly sourceId: ProviderId) {}

  /** Returns null when the request may proceed, otherwise a reason string. */
  async acquire(): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from("data_sources")
      .select(
        "rate_limit_per_min, rate_limit_per_day, minute_window_start, requests_this_minute, day_window_start, requests_today, status",
      )
      .eq("id", this.sourceId)
      .maybeSingle();

    // Never block ingestion on bookkeeping failures.
    if (error || !data) return null;
    if (data.status !== "active") return `source ${this.sourceId} is ${data.status}`;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const minuteStart = data.minute_window_start ? new Date(data.minute_window_start) : null;
    const inMinute = minuteStart !== null && now.getTime() - minuteStart.getTime() < 60_000;
    const inDay = data.day_window_start === today;

    const perMinute = inMinute ? data.requests_this_minute : 0;
    const perDay = inDay ? data.requests_today : 0;

    if (data.rate_limit_per_day !== null && perDay >= data.rate_limit_per_day) {
      return `daily quota exhausted for ${this.sourceId}`;
    }
    if (data.rate_limit_per_min !== null && perMinute >= data.rate_limit_per_min) {
      const waitMs = 60_000 - (now.getTime() - (minuteStart?.getTime() ?? now.getTime()));
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitMs) + 250));
      return this.acquire();
    }

    await supabaseAdmin
      .from("data_sources")
      .update({
        minute_window_start: inMinute ? data.minute_window_start : now.toISOString(),
        requests_this_minute: perMinute + 1,
        day_window_start: today,
        requests_today: perDay + 1,
        last_request_at: now.toISOString(),
      })
      .eq("id", this.sourceId);

    return null;
  }

  async reportSuccess(): Promise<void> {
    await supabaseAdmin
      .from("data_sources")
      .update({ last_success_at: new Date().toISOString() })
      .eq("id", this.sourceId);
  }

  async reportError(message: string): Promise<void> {
    await supabaseAdmin
      .from("data_sources")
      .update({ last_error_at: new Date().toISOString(), last_error: message.slice(0, 500) })
      .eq("id", this.sourceId);
  }
}
