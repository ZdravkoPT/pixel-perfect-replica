import { Star } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listFavorites, toggleFavorite, type FavoriteEntity } from "@/lib/favorites.functions";
import { useAuth } from "@/hooks/useAuth";

export const favoritesQueryKey = ["favorites"] as const;

export function useFavorites() {
  const { user } = useAuth();
  const fetchFavorites = useServerFn(listFavorites);
  return useQuery({
    queryKey: favoritesQueryKey,
    queryFn: () => fetchFavorites(),
    enabled: Boolean(user),
  });
}

export function FavoriteButton({
  entityType,
  entityId,
  label,
  className = "",
}: {
  entityType: FavoriteEntity;
  entityId: string;
  label: string;
  className?: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const favorites = useFavorites();
  const toggle = useServerFn(toggleFavorite);

  const following = (favorites.data?.favorites ?? []).some(
    (favorite) => favorite.entity_type === entityType && favorite.entity_id === entityId,
  );

  const mutation = useMutation({
    mutationFn: () => toggle({ data: { entityType, entityId } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success(result.following ? `Following ${label}` : `Unfollowed ${label}`);
    },
    onError: () => toast.error("Could not update your watchlist"),
  });

  return (
    <button
      type="button"
      aria-label={following ? `Unfollow ${label}` : `Follow ${label}`}
      aria-pressed={following}
      disabled={mutation.isPending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!user) {
          toast.info("Sign in to build a watchlist");
          return;
        }
        mutation.mutate();
      }}
      className={`rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:opacity-50 ${
        following ? "text-primary" : ""
      } ${className}`}
    >
      <Star className={`h-4 w-4 ${following ? "fill-current" : ""}`} />
    </button>
  );
}
