import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Activity, BarChart3, Brain, ClipboardList, GitCompare, LayoutGrid, LogOut, Radio, ShieldCheck, Shirt, Sparkles, Search, Star, TrendingUp, Trophy, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { GoalAlerts } from "@/components/GoalAlerts";

const NAV_GROUPS = [
  {
    label: "Matches",
    items: [
      { to: "/", label: "Fixtures", icon: LayoutGrid },
      { to: "/live", label: "Live", icon: Radio },
      { to: "/watchlist", label: "Watchlist", icon: Star },
      { to: "/leagues", label: "Leagues", icon: Trophy },
      { to: "/search", label: "Search", icon: Search },
    ],
  },
  {
    label: "Betting",
    items: [
      { to: "/value", label: "Value board", icon: TrendingUp },
      { to: "/ai-bets", label: "AI bet builder", icon: Sparkles },
      { to: "/analytics", label: "Model analytics", icon: Brain },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/players", label: "Players", icon: Users },
      { to: "/squads", label: "Squads", icon: Shirt },
      { to: "/compare", label: "Compare", icon: GitCompare },
      { to: "/coaches", label: "Coaches", icon: ClipboardList },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/providers", label: "Provider health", icon: Activity },
      { to: "/admin", label: "Diagnostics", icon: ShieldCheck },
    ],
  },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex flex-col lg:flex-row">
        <aside className="border-b border-border bg-sidebar lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-4">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="font-mono text-sm font-semibold uppercase tracking-widest">
              Football Intel
            </span>
          </div>

          <nav className="flex gap-4 overflow-x-auto px-4 py-3 lg:flex-col lg:gap-5 lg:overflow-visible lg:py-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="shrink-0">
                <p className="mb-1.5 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground lg:block">
                  {group.label}
                </p>
                <div className="flex gap-1 lg:flex-col">
                  {group.items.map(({ to, label, icon: Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      activeOptions={{ exact: to === "/" }}
                      className="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                      activeProps={{
                        className: "bg-sidebar-accent text-foreground font-medium",
                      }}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap">{label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-border/60 px-4 py-4">
            {user ? (
              <div className="space-y-2">
                <GoalAlerts />
                <p className="truncate font-mono text-[11px] text-muted-foreground">{user.email}</p>
                <Button variant="outline" size="sm" className="w-full" onClick={() => signOut()}>
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  Sign out
                </Button>
              </div>
            ) : (
              <Link
                to="/auth"
                className="block rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Sign in
              </Link>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-border bg-background/85 px-4 py-4 backdrop-blur lg:px-8">
            <h1 className="font-mono text-xl font-semibold uppercase tracking-wide lg:text-2xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </header>
          <div className="px-4 py-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
