// components/ui/status-badge.tsx
'use client';

import * as React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  HelpCircle,
  Zap,
} from 'lucide-react';

export type BadgeStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'BLOCKED'
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'TIMEOUT'
  | 'OK'
  | 'DEGRADED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | string;

interface StatusBadgeProps {
  status: BadgeStatus;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  size = 'md',
  showIcon = true,
  className = '',
}: StatusBadgeProps) {
  const norm = (status || '').toUpperCase();

  let label = status;
  let bg = 'bg-slate-200 text-slate-900 border-slate-900';
  let icon = <HelpCircle className="h-3 w-3 stroke-[2.5]" />;

  switch (norm) {
    case 'SUCCESS':
    case 'OK':
    case '200':
    case 'ACTIVE':
      bg = 'bg-emerald-300 dark:bg-emerald-400 text-slate-950 border-slate-900';
      icon = <CheckCircle2 className="h-3 w-3 stroke-[2.5]" />;
      label = norm === 'SUCCESS' ? 'Success' : norm === 'ACTIVE' ? 'Active' : 'OK';
      break;

    case 'CONFIGURED':
      bg = 'bg-emerald-300 dark:bg-emerald-400 text-slate-950 border-slate-900';
      icon = <CheckCircle2 className="h-3 w-3 stroke-[2.5]" />;
      label = 'Configured';
      break;

    case 'NOT_CONFIGURED':
    case 'INACTIVE':
      bg = 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-900';
      icon = <HelpCircle className="h-3 w-3 stroke-[2.5]" />;
      label = norm === 'INACTIVE' ? 'Inactive' : 'Not Configured';
      break;

    case 'FAILED':
    case 'ERROR':
    case '500':
    case 'DEGRADED':
      bg = 'bg-rose-300 dark:bg-rose-400 text-slate-950 border-slate-900';
      icon = <XCircle className="h-3 w-3 stroke-[2.5]" />;
      label = norm === 'DEGRADED' ? 'Degraded' : 'Failed';
      break;

    case 'BLOCKED':
    case 'SSRF':
      bg = 'bg-purple-300 dark:bg-purple-400 text-slate-950 border-slate-900';
      icon = <ShieldAlert className="h-3 w-3 stroke-[2.5]" />;
      label = 'Blocked';
      break;

    case 'RATE_LIMITED':
    case '429':
      bg = 'bg-amber-300 dark:bg-amber-400 text-slate-950 border-slate-900';
      icon = <AlertTriangle className="h-3 w-3 stroke-[2.5]" />;
      label = 'Rate Limited';
      break;

    case 'AUTH_FAILED':
    case '401':
    case '403':
      bg = 'bg-orange-300 dark:bg-orange-400 text-slate-950 border-slate-900';
      icon = <ShieldAlert className="h-3 w-3 stroke-[2.5]" />;
      label = 'Auth Failed';
      break;

    case 'TIMEOUT':
      bg = 'bg-yellow-300 dark:bg-yellow-400 text-slate-950 border-slate-900';
      icon = <Clock className="h-3 w-3 stroke-[2.5]" />;
      label = 'Timeout';
      break;
  }

  const sizeClasses =
    size === 'sm'
      ? 'text-[10px] px-2 py-0.5 gap-1 font-mono font-bold'
      : 'text-xs px-2.5 py-0.5 gap-1.5 font-bold font-mono';

  return (
    <span
      className={`pop-badge uppercase ${bg} ${sizeClasses} ${className}`}
    >
      {showIcon && icon}
      <span>{label}</span>
    </span>
  );
}
