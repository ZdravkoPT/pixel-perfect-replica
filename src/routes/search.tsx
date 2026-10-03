import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { searchAll } from "@/lib/leagues.functions";

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === "string" ? s.q : "" }),
  head: () => ({
    meta: [
      { title: "Search | Football Intelligence" },
      { name: "description", content: "Find any team, player, coach or league in the app." },
      { property: "og:title", content: "Search | Football Intelligence" },
      { property: "og:description", content: "Search teams, players, coaches and leagues." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

function Group({ title, children, n }: { title: string; n: number; children: React.ReactNode }) {
  if (!n) return null;
  return (
    <section>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title} · {n}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}
const card = "flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm hover:bg-accent";

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [text, setText] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => { if (text !== q) navigate({ search: { q: text }, replace: true }); }, 300);
    return () => clearTimeout(t);
  }, [text, q, navigate]);
  const { data, isFetching } = useQuery({ queryKey: ["search", q], queryFn: () => searchAll({ data: { q } }), enabled: q.trim().length >= 2 });
  const total = data ? data.teams.length + data.players.length + data.coaches.length + data.leagues.length : 0;
  return (
    <AppShell title="Search" subtitle="Teams, players, coaches and leagues.">
      <div className="space-y-6">
        <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Arsenal, Haaland, Farioli…" className="max-w-xl" />
        {q.trim().length < 2 ? <p className="text-sm text-muted-foreground">Type at least 2 letters.</p>
          : isFetching && !data ? <p className="text-sm text-muted-foreground">Searching…</p>
          : total === 0 ? <p className="text-sm text-muted-foreground">Nothing found for “{q}”.</p> : data && (
          <>
            <Group title="Teams" n={data.teams.length}>
              {data.teams.map((t) => <Link key={t.id} to="/teams/$teamId" params={{ teamId: t.id }} className={card}>
                {t.crest_url ? <img src={t.crest_url} alt="" className="h-6 w-6 object-contain" /> : null}<span>{t.name}<span className="ml-1 text-xs text-muted-foreground">{t.country}</span></span></Link>)}
            </Group>
            <Group title="Players" n={data.players.length}>
              {data.players.map((p) => <Link key={p.id} to="/players/$playerId" params={{ playerId: p.id }} className={card}>
                <span>{p.name}<span className="ml-1 text-xs text-muted-foreground">{[p.position, p.nationality].filter(Boolean).join(" · ")}</span></span></Link>)}
            </Group>
            <Group title="Coaches" n={data.coaches.length}>
              {data.coaches.map((c) => <Link key={c.id} to="/coaches/$coachId" params={{ coachId: c.id }} className={card}>
                <span>{c.name}<span className="ml-1 text-xs text-muted-foreground">{c.nationality}</span></span></Link>)}
            </Group>
            <Group title="Leagues" n={data.leagues.length}>
              {data.leagues.map((l) => <Link key={l.id} to="/leagues/$leagueId" params={{ leagueId: l.id }} className={card}>
                <span>{l.name}<span className="ml-1 text-xs text-muted-foreground">{l.country}</span></span></Link>)}
            </Group>
          </>
        )}
      </div>
    </AppShell>
  );
}
