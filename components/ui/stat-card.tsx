// components/ui/stat-card.tsx
'use client';

import * as React from 'react';
import { LucideIcon, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export type PopCardVariant = 'lavender' | 'sky' | 'mint' | 'yellow' | 'coral' | 'pink' | 'default';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  variant?: PopCardVariant;
  badge?: string;
  badgeVariant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  loading?: boolean;
}

const variantCardStyles: Record<PopCardVariant, { bg: string; iconBg: string; textAccent: string }> = {
  lavender: {
    bg: 'bg-[var(--color-pop-lavender)]',
    iconBg: 'bg-violet-400 dark:bg-violet-600 text-slate-950',
    textAccent: 'text-violet-900 dark:text-violet-200',
  },
  sky: {
    bg: 'bg-[var(--color-pop-sky)]',
    iconBg: 'bg-sky-400 dark:bg-sky-600 text-slate-950',
    textAccent: 'text-sky-900 dark:text-sky-200',
  },
  mint: {
    bg: 'bg-[var(--color-pop-mint)]',
    iconBg: 'bg-emerald-400 dark:bg-emerald-600 text-slate-950',
    textAccent: 'text-emerald-900 dark:text-emerald-200',
  },
  yellow: {
    bg: 'bg-[var(--color-pop-yellow)]',
    iconBg: 'bg-amber-400 dark:bg-amber-500 text-slate-950',
    textAccent: 'text-amber-950 dark:text-amber-200',
  },
  coral: {
    bg: 'bg-[var(--color-pop-coral)]',
    iconBg: 'bg-orange-400 dark:bg-orange-600 text-slate-950',
    textAccent: 'text-orange-950 dark:text-orange-200',
  },
  pink: {
    bg: 'bg-[var(--color-pop-pink)]',
    iconBg: 'bg-pink-400 dark:bg-pink-600 text-slate-950',
    textAccent: 'text-pink-950 dark:text-pink-200',
  },
  default: {
    bg: 'bg-[var(--color-surface)]',
    iconBg: 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]',
    textAccent: 'text-[var(--color-text-primary)]',
  },
};

export function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  variant = 'default',
  badge,
  loading = false,
}: StatCardProps) {
  const style = variantCardStyles[variant] || variantCardStyles.default;

  return (
    <Card className={`pop-card pop-card-hover ${style.bg} text-slate-950 dark:text-slate-100 group relative overflow-hidden`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-black tracking-wider uppercase opacity-80">
              <span className="star-accent text-xs">✦</span>
              <span>{label}</span>
            </div>
            {loading ? (
              <div className="h-8 w-24 animate-pulse rounded bg-black/10 dark:bg-white/10" />
            ) : (
              <p className="text-3xl font-black tracking-tight font-mono">
                {value}
              </p>
            )}
          </div>

          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] ${style.iconBg} transition-transform duration-200 group-hover:rotate-6`}
          >
            <Icon className="h-5 w-5 stroke-[2.5]" />
          </div>
        </div>

        {(subtext || badge) && (
          <div className="mt-4 flex items-center justify-between pt-2.5 border-t-2 border-black/10 dark:border-white/10 text-xs font-bold font-mono">
            {subtext && (
              <p className="text-[11px] opacity-85 truncate">
                {subtext}
              </p>
            )}
            {badge && (
              <span className="pop-badge bg-white dark:bg-slate-900 text-slate-950 dark:text-slate-100 text-[10px]">
                {badge}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
