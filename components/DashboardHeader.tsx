// components/DashboardHeader.tsx
'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useSession, signOut, signIn } from 'next-auth/react';
import { LogOut, LogIn, User as UserIcon, Activity, ChevronRight, Terminal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import Link from 'next/link';

const breadcrumbMap: Record<string, { label: string; parent?: string }> = {
  '/': { label: 'Dashboard' },
  '/admin/integrations': { label: 'Integrations', parent: 'Build & Gateway' },
  '/admin/endpoints': { label: 'MCP Endpoints', parent: 'Build & Gateway' },
  '/admin/playground': { label: 'Playground', parent: 'Build & Gateway' },
  '/admin/logs': { label: 'Execution Logs', parent: 'Observability' },
  '/admin/health': { label: 'System Health', parent: 'Observability' },
};

export function DashboardHeader() {
  const { data: session, status } = useSession();
  const pathname = usePathname() || '/';

  const [isHealthy, setIsHealthy] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    // Check liveness probe lightweight
    const checkLiveness = async () => {
      try {
        const res = await fetch('/api/health?probe=liveness', { cache: 'no-store' });
        if (isMounted) {
          setIsHealthy(res.ok);
        }
      } catch {
        if (isMounted) {
          setIsHealthy(false);
        }
      }
    };

    checkLiveness();
    const interval = setInterval(checkLiveness, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const currentRoute = breadcrumbMap[pathname] || {
    label: pathname.replace('/admin/', '').replace('/', ''),
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b-2 border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 md:px-6 backdrop-blur-md transition-colors duration-200">
      {/* Breadcrumb Trail */}
      <div className="flex items-center gap-2 text-xs font-bold font-mono">
        <Link
          href="/"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition flex items-center gap-1.5"
        >
          <span className="text-amber-500">✦</span>
          <span>MCP_GATEWAY</span>
        </Link>

        {currentRoute.parent && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)] stroke-[2.5]" />
            <span className="text-[var(--color-text-muted)] hidden sm:inline">{currentRoute.parent}</span>
          </>
        )}

        <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)] stroke-[2.5]" />
        <span className="font-extrabold text-[var(--color-text-primary)] bg-[var(--color-pop-yellow)] px-2 py-0.5 rounded border border-[var(--color-border)] text-slate-950">
          {currentRoute.label}
        </span>
      </div>

      {/* Right Controls: Live Probe Pill, Theme Toggle, & User Profile */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Live System Status Pill */}
        <Link
          href="/admin/health"
          className="hidden items-center gap-2 rounded-full border-2 border-[var(--color-border)] bg-[var(--color-pop-mint)] text-slate-950 px-3 py-1 text-xs font-black shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all sm:flex"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isHealthy === true
                ? 'bg-emerald-600 animate-pulse'
                : isHealthy === false
                ? 'bg-rose-600'
                : 'bg-amber-600'
            }`}
          />
          <span className="text-[10px] tracking-wider uppercase font-mono">
            {isHealthy === true ? '● SYSTEM LIVE' : isHealthy === false ? '⚠ DEGRADED' : 'PROBING'}
          </span>
        </Link>

        {/* Global Theme Toggle */}
        <ThemeToggle />

        {status === 'loading' ? (
          <div className="h-8 w-20 animate-pulse rounded-xl bg-[var(--color-surface-hover)] border-2 border-[var(--color-border)]" />
        ) : session?.user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* User Profile */}
            <div className="hidden items-center gap-2 sm:flex bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] px-2.5 py-1 rounded-xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="h-6 w-6 rounded-full border border-[var(--color-border)] object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-slate-950 border border-[var(--color-border)] font-bold text-xs">
                  <UserIcon className="h-3.5 w-3.5" />
                </div>
              )}
              <div className="text-left max-w-[120px] truncate">
                <p className="text-xs font-extrabold text-[var(--color-text-primary)] truncate leading-tight">
                  {session.user.name || 'Developer'}
                </p>
              </div>
            </div>

            {/* Logout Action */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="pop-btn h-8 px-2.5 bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-rose-100 hover:text-rose-700 text-xs transition"
              aria-label="Sign Out"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline ml-1 font-bold">Logout</span>
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() => signIn()}
            className="pop-btn h-8 px-3 bg-amber-400 text-slate-950 font-black hover:bg-amber-300 text-xs transition"
          >
            <LogIn className="h-3.5 w-3.5 stroke-[2.5] mr-1" />
            <span>Sign In</span>
          </Button>
        )}
      </div>
    </header>
  );
}