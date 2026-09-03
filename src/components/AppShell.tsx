import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Activity, BarChart3, LayoutGrid, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Matches", icon: LayoutGrid },
  { to: "/providers", label: "Provider health", icon: Activity },
  { to: "/admin", label: "Diagnostics", icon: ShieldCheck },
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
      <div className="mx-auto flex max-w-7xl flex-col lg:flex-row">
        <aside className="border-b border-border bg-sidebar px-4 py-5 lg:min-h-screen lg:w-60 lg:border-r lg:border-b-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold tracking-tight">Football Intel</span>
          </div>

          <nav className="mt-6 flex gap-1 lg:flex-col">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                activeProps={{ className: "bg-sidebar-accent text-foreground font-medium" }}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-6 border-t border-border pt-4">
            {user ? (
              <div className="space-y-2">
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <Button variant="outline" size="sm" className="w-full" onClick={() => signOut()}>
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  Sign out
                </Button>
              </div>
            ) : (
              <Link
                to="/auth"
                className="block rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
              >
                Sign in
              </Link>
            )}
          </div>
        </aside>

        <main className="flex-1 px-4 py-6 lg:px-8">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
