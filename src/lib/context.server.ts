/**
 * Squad / coaching context loader for the prediction engine.
 *
 * Reads the attribute cards we cache per player (rating-derived overall,
 * season minutes, market value, age), the open injury records and the current
 * coaching spell, and turns them into the per-team context the model uses.
 *
 * Anything the providers do not give us stays null — no invented numbers.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emptySquadContext, type SquadContext } from "./models/context";

interface AttributeRow {
  overall: number | null;
  rating: number | null;
  minutes: number | null;
  market_value: number | null;
  age: number | null;
}

/** 0-1 experience score: big-club market value plus minutes actually played. */
function experienceScore(rows: AttributeRow[]): number | null {
  const values = rows
    .map((row) => {
      const value = row.market_value && row.market_value > 0 ? Math.log10(row.market_value) : null;
      const minutes = row.minutes && row.minutes > 0 ? Math.min(row.minutes / 2400, 1) : null;
      if (value === null && minutes === null) return null;
      // log10 5.5 (~300k) -> 0, log10 8.0 (~100m) -> 1
      const valueScore = value === null ? null : Math.min(1, Math.max(0, (value - 5.5) / 2.5));
      if (valueScore === null) return minutes;
      if (minutes === null) return valueScore;
      return valueScore * 0.65 + minutes * 0.35;
    })
    .filter((value): value is number => value !== null);

  if (values.length < 6) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function loadSquadContexts(teamIds: string[]): Promise<Map<string, SquadContext>> {
  const contexts = new Map<string, SquadContext>();
  const unique = [...new Set(teamIds)].filter(Boolean);
  if (unique.length === 0) return contexts;

  for (const teamId of unique) contexts.set(teamId, emptySquadContext());

  // --- squad attribute cards -------------------------------------------
  const byTeam = new Map<string, Array<AttributeRow & { playerId: string }>>();
  for (let i = 0; i < unique.length; i += 40) {
    const slice = unique.slice(i, i + 40);
    const { data } = await supabaseAdmin
      .from("squad_memberships")
      .select(
        "team_id, player_id, player:players(player_attributes(overall, rating, minutes, market_value, age))",
      )
      .in("team_id", slice)
      .eq("is_current", true);

    for (const row of (data ?? []) as unknown as Array<{
      team_id: string;
      player_id: string;
      player: { player_attributes: AttributeRow[] } | null;
    }>) {
      const card = row.player?.player_attributes?.[0];
      if (!card) continue;
      const list = byTeam.get(row.team_id) ?? [];
      list.push({ ...card, playerId: row.player_id });
      byTeam.set(row.team_id, list);
    }
  }

  // --- unavailable players ---------------------------------------------
  const { data: injuryRows } = await supabaseAdmin
    .from("injuries")
    .select("player_id, team_id")
    .is("resolved_at", null);
  const unavailable = new Set((injuryRows ?? []).map((row) => row.player_id));

  // --- current coaching spells -----------------------------------------
  const coachStart = new Map<string, string | null>();
  for (let i = 0; i < unique.length; i += 40) {
    const { data } = await supabaseAdmin
      .from("coach_spells")
      .select("team_id, started_at")
      .in("team_id", unique.slice(i, i + 40))
      .eq("is_current", true);
    for (const row of data ?? []) coachStart.set(row.team_id, row.started_at);
  }

  const now = Date.now();
  for (const teamId of unique) {
    const cards = (byTeam.get(teamId) ?? []).filter((card) => card.overall !== null);
    const core = cards.sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 14);

    const started = coachStart.get(teamId) ?? null;
    const coachDays = started ? Math.max(0, (now - new Date(started).getTime()) / 86_400_000) : null;

    if (core.length === 0) {
      contexts.set(teamId, { ...emptySquadContext(), coachDays });
      continue;
    }

    const quality = core.reduce((sum, card) => sum + (card.overall ?? 0), 0) / core.length;
    const out = core.filter((card) => unavailable.has(card.playerId)).length;

    contexts.set(teamId, {
      quality,
      coverage: core.length,
      experience: experienceScore(core),
      unavailable: out / core.length,
      coachDays,
    });
  }

  return contexts;
}
