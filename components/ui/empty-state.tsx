// components/ui/empty-state.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { LucideIcon, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`pop-card flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] ${className}`}
    >
      <div className="relative mb-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-pop-yellow)] text-slate-950 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
          {Icon ? <Icon className="h-8 w-8 stroke-[2.2]" /> : <Sparkles className="h-8 w-8 stroke-[2.2]" />}
        </div>
        <span className="absolute -top-2 -right-2 text-xl font-black text-amber-500">✦</span>
      </div>

      <h3 className="text-lg font-black text-[var(--color-text-primary)] font-mono tracking-tight">
        {title}
      </h3>
      <p className="mt-1.5 max-w-md text-xs sm:text-sm font-medium text-[var(--color-text-secondary)] leading-relaxed">
        {description}
      </p>

      {actionLabel && (
        <div className="mt-6">
          {actionHref ? (
            <Button
              asChild
              className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 px-5 py-2 text-xs font-black gap-2 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
            >
              <Link href={actionHref}>
                <span>{actionLabel}</span>
                <ArrowRight className="h-4 w-4 stroke-[2.5]" />
              </Link>
            </Button>
          ) : (
            <Button
              onClick={onAction}
              className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 px-5 py-2 text-xs font-black gap-2 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
            >
              <span>{actionLabel}</span>
              <ArrowRight className="h-4 w-4 stroke-[2.5]" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
