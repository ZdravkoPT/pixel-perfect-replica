/** Maps free-text team names from outside sources onto our team ids. */
import { namesMatch, normalizeTeamName } from "@/lib/providers/normalize";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export async function buildTeamResolver(admin: Admin) {
  const teams: Array<{ id: string; name: string; short_name: string | null; country: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("teams").select("id, name, short_name, country").range(from, from + 999);
    if (!data?.length) break;
    teams.push(...data);
    if (data.length < 1000) break;
  }
  const { data: aliases } = await admin.from("team_aliases").select("team_id, normalized_alias").limit(20000);
  const exact = new Map<string, string>();
  for (const t of teams) {
    exact.set(normalizeTeamName(t.name), t.id);
    if (t.short_name) exact.set(normalizeTeamName(t.short_name), t.id);
  }
  for (const a of aliases ?? []) exact.set(a.normalized_alias, a.team_id);
  const cache = new Map<string, string | null>();

  return (name: string, opts: { national?: boolean } = {}): string | null => {
    const key = `${opts.national ? "n:" : ""}${name}`;
    if (cache.has(key)) return cache.get(key)!;
    const n = normalizeTeamName(name);
    let id = exact.get(n) ?? null;
    if (!id) {
      const pool = opts.national ? teams.filter((t) => normalizeTeamName(t.name) === n) : teams;
      id = pool.find((t) => namesMatch(t.name, name, 0.88))?.id ?? null;
    }
    cache.set(key, id);
    return id;
  };
}
