export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const NOISE = [
  "fc", "cf", "sc", "ac", "afc", "club", "cd", "ud", "sv", "bk", "if",
  "calcio", "de", "futbol", "football", "the",
];

export function normalizeTeamName(name: string): string {
  const base = slugify(name).split("-").filter(Boolean);
  const filtered = base.filter((token) => !NOISE.includes(token));
  return (filtered.length > 0 ? filtered : base).join("-");
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const s = a.length >= b.length ? a : b;
  const t = a.length >= b.length ? b : a;
  if (s.length === 0) return 1;

  let prev: number[] = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    const curr: number[] = [i];
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    prev = curr;
  }
  const distance = prev[t.length] ?? s.length;
  return 1 - distance / s.length;
}

/**
 * True when two club names almost certainly denote the same team.
 * Combines edit-distance similarity with token containment so that
 * "Celta Vigo" matches "RC Celta de Vigo" and "Monaco" matches "AS Monaco FC".
 */
export function namesMatch(a: string, b: string, threshold = 0.82): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (na === nb) return true;
  if (similarity(na, nb) >= threshold) return true;

  const ta = na.split("-").filter(Boolean);
  const tb = nb.split("-").filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return false;
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const covered = small.every((token) =>
    big.some((other) => other === token || (token.length >= 4 && other.startsWith(token))),
  );
  return covered && small.join("").length >= 4;
}


export function matchCanonicalId(
  leagueCanonicalId: string,
  kickoffIso: string,
  homeName: string,
  awayName: string,
): string {
  const date = kickoffIso.slice(0, 10);
  return `${leagueCanonicalId}:${date}:${normalizeTeamName(homeName)}-vs-${normalizeTeamName(awayName)}`;
}
