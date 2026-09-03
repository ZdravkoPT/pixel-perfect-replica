import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MatchCard, type MatchCardData } from "@/components/MatchCard";
import { FavoriteButton, useFavorites } from "@/components/FavoriteButton";
import { Badge } from "@/components/ui/badge";
import { listWatchlistMatches } from "@/lib/favorites.functions";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "My Watchlist — Football Intelligence" },
      {
        name: "description",
        content:
          "Follow teams and leagues to get a personalised feed of fixtures, results and model predictions.",
      },
      { property: "og:title", content: "My Watchlist — Football Intelligence" },
      {
        property: "og:description",
        content: "A personalised feed of fixtures and model predictions for the clubs you follow.",
      },
    ],
  }),
  component: WatchlistPage,
});

function WatchlistPage() {
  const { user, loading } = useAuth();
  const favorites = useFavorites();
  const fetchWatchlist = useServerFn(listWatchlistMatches);
  const watchlist = useQuery({
    queryKey: ["watchlist", 14],
    queryFn: () => fetchWatchlist({ data: { days: 14 } }),
    enabled: Boolean(user),
  });

  if (!user) {
    return (
      <AppShell title="My watchlist" subtitle="Follow clubs and leagues to build a personal feed">
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {loading ? (
            "Checking your session…"
          ) : (
            <>
              <p>Sign in to follow teams and leagues.</p>
              <Link to="/auth" className="mt-3 inline-block text-primary underline">
                Sign in
              </Link>
            </>
          )}
        </div>
      </AppShell>
    );
  }

  const followed = favorites.data?.favorites ?? [];
  const matches = (watchlist.data?.matches ?? []) as unknown as MatchCardData[];
  const predictions = watchlist.data?.predictions ?? {};

  return (
    <AppShell
      title="My watchlist"
      subtitle={`${followed.length} followed · ${matches.length} fixtures in the next 14 days`}
    >
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Following
        </h2>
        {followed.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Nothing followed yet — tap the <Star className="inline h-3.5 w-3.5" /> on any fixture to
            follow a club or league.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {followed.map((favorite) => (
              <span
                key={favorite.id}
                className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-sm"
              >
                {favorite.image ? (
                  <img src={favorite.image} alt="" loading="lazy" className="h-4 w-4 object-contain" />
                ) : null}
                <span className="truncate">{favorite.name}</span>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {favorite.entity_type}
                </Badge>
                <FavoriteButton
                  entityType={favorite.entity_type as "team" | "league"}
                  entityId={favorite.entity_id}
                  label={favorite.name}
                />
              </span>
            ))}
          </div>
        )}
      </section>

      {watchlist.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your fixtures…</p>
      ) : matches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No fixtures scheduled for your selections in this window.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {matches.map((match) => {
            const prediction = predictions[match.id];
            return (
              <div key={match.id} className="space-y-1">
                <MatchCard match={match} />
                {prediction ? (
                  <p className="px-1 text-[11px] text-muted-foreground">
                    Model: {(prediction.p_home * 100).toFixed(0)}% /{" "}
                    {(prediction.p_draw * 100).toFixed(0)}% /{" "}
                    {(prediction.p_away * 100).toFixed(0)}%
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
