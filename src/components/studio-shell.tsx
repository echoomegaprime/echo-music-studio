import { Link, useRouterState } from "@tanstack/react-router";
import { Disc3, FolderOpen, ListMusic, Settings2, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";
import { MiniPlayer } from "@/components/studio/mini-player";
import { Skeleton } from "@/components/ui/skeleton";

const NAV = [
  { to: "/", label: "Studio", icon: SlidersHorizontal },
  { to: "/library", label: "Library", icon: ListMusic },
  { to: "/projects", label: "Projects", icon: FolderOpen },
  { to: "/jobs", label: "Jobs", icon: Disc3 },
  { to: "/settings", label: "Vault", icon: Settings2 },
] as const;

function GateSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg p-6">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="mt-8 h-64 w-full rounded-xl" />
    </div>
  );
}

export function StudioGate({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || isPending) return <GateSkeleton />;
  if (!user) return <RedirectToSignIn />;
  return <StudioShell name={user.displayName ?? user.primaryEmail ?? "Account"}>{children}</StudioShell>;
}

function StudioShell({ children, name }: { children: ReactNode; name: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-lg tracking-tight">Echo Suno</span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Studio</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-36 truncate text-sm text-muted sm:inline">{name}</span>
          <button
            type="button"
            onClick={() => void signOut("/login")}
            className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav className="hidden w-48 shrink-0 flex-col gap-1 border-r border-border p-3 md:flex">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-md px-3 text-sm transition-colors duration-150",
                  active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto pb-28 md:pb-24">{children}</main>
      </div>

      <MiniPlayer />

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-bg/95 md:hidden">
        {NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-wider",
                active ? "text-fg" : "text-muted",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
