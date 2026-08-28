// components/AppNavigation.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Boxes,
  Server,
  PlaySquare,
  Activity,
  HeartPulse,
  ChevronRight,
  ShieldCheck,
  Zap,
  Sparkles,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        href: '/',
        label: 'Dashboard',
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    label: 'Build & Gateway',
    items: [
      {
        href: '/admin/integrations',
        label: 'Integrations',
        icon: Boxes,
      },
      {
        href: '/admin/endpoints',
        label: 'MCP Endpoints',
        icon: Server,
      },
      {
        href: '/admin/playground',
        label: 'Playground',
        badge: 'HOT',
        icon: PlaySquare,
      },
    ],
  },
  {
    label: 'Observability',
    items: [
      {
        href: '/admin/logs',
        label: 'Execution Logs',
        icon: Activity,
      },
      {
        href: '/admin/health',
        label: 'System Health',
        icon: HeartPulse,
      },
    ],
  },
];

export function AppNavigation() {
  const pathname = usePathname() || '';

  const isItemActive = (item: NavItem) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r-2 border-[var(--color-border)] bg-[var(--color-surface)] lg:block transition-colors duration-200 shadow-[2px_0px_0px_0px_rgba(0,0,0,0.05)]">
      <div className="sticky top-0 flex h-screen flex-col justify-between">
        {/* Top Section */}
        <div>
          {/* Brand Header */}
          <div className="border-b-2 border-[var(--color-border)] px-5 py-4 bg-[var(--color-surface-elevated)]/50">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-slate-900 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] group-hover:translate-x-[-1px] group-hover:translate-y-[-1px] group-hover:shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] transition-all">
                <Server className="h-5 w-5 stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm text-[var(--color-text-primary)] tracking-tight">
                    MCP Gateway
                  </span>
                  <span className="rounded-md bg-amber-300 dark:bg-amber-400 px-1.5 py-0.2 text-[10px] font-black text-slate-950 border border-[var(--color-border)]">
                    HUB
                  </span>
                </div>
                <p className="text-[11px] font-bold text-[var(--color-text-muted)] flex items-center gap-1">
                  <span>DEV CONSOLE</span>
                  <span>✦</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">v2.3</span>
                </p>
              </div>
            </Link>
          </div>

          {/* Grouped Navigation */}
          <nav className="space-y-6 px-3 py-5 overflow-y-auto max-h-[calc(100vh-190px)]">
            {navGroups.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <div className="px-3 pb-1 text-[11px] font-extrabold tracking-wider text-[var(--color-text-muted)] uppercase font-mono flex items-center gap-1.5">
                  <span>✦</span>
                  <span>{group.label}</span>
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-all duration-150 ${
                        active
                          ? 'bg-[var(--color-pop-yellow)] text-slate-950 border-2 border-[var(--color-border)] shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] translate-x-[-1px] translate-y-[-1px]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)] border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`h-4 w-4 stroke-[2.2] ${active ? 'text-slate-950' : 'text-[var(--color-text-muted)]'}`} />
                        <span>{item.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.badge && (
                          <span className="rounded-full bg-rose-500 text-white px-1.5 py-0.2 text-[9px] font-black tracking-wide border border-slate-900 shadow-[1px_1px_0px_0px_rgba(15,23,42,1)]">
                            {item.badge}
                          </span>
                        )}
                        {active && <ChevronRight className="h-3.5 w-3.5 stroke-[3] text-slate-950" />}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Security Core Footer Pill */}
        <div className="border-t-2 border-[var(--color-border)] p-3.5 bg-[var(--color-surface-elevated)]/50">
          <div className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-pop-mint)] p-3 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] text-slate-950">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-700 stroke-[2.5]" />
                <span className="text-xs font-black tracking-tight">SECURITY CORE</span>
              </div>
              <span className="flex h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            </div>
            <p className="mt-1 text-[10px] font-bold text-emerald-800 leading-snug">
              P0.1–P2.3 Encryption & SSRF Firewall Active
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileNavigation() {
  const pathname = usePathname() || '';

  const flatItems = navGroups.flatMap((g) => g.items);

  const isItemActive = (item: NavItem) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };

  return (
    <nav className="flex overflow-x-auto border-b-2 border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 lg:hidden transition-colors duration-200 gap-1">
      {flatItems.map((item) => {
        const Icon = item.icon;
        const active = isItemActive(item);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              active
                ? 'bg-[var(--color-pop-yellow)] text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-transparent'
            }`}
          >
            <Icon className="h-3.5 w-3.5 stroke-[2.2]" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}