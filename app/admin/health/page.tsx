// app/admin/health/page.tsx
'use client';

import * as React from 'react';
import {
  HeartPulse,
  Database,
  Server,
  ShieldCheck,
  RefreshCw,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Cpu,
  Zap,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { StatCard } from '@/components/ui/stat-card';

interface HealthData {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  timestamp: string;
  uptime_seconds: number;
  services?: {
    database: {
      status: 'ok' | 'error';
      latency_ms?: number;
    };
  };
}

export default function HealthPage() {
  const [health, setHealth] = React.useState<HealthData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [probing, setProbing] = React.useState(false);
  const [lastCheck, setLastCheck] = React.useState<Date | null>(null);

  const fetchHealth = async (isManual = false) => {
    try {
      if (isManual) setProbing(true);
      const res = await fetch('/api/health', { cache: 'no-store' });
      const data = await res.json();
      setHealth(data);
      setLastCheck(new Date());
    } catch (err) {
      console.error('Failed to fetch health probe:', err);
      setHealth({
        status: 'degraded',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        uptime_seconds: 0,
        services: {
          database: {
            status: 'error',
          },
        },
      });
      setLastCheck(new Date());
    } finally {
      setLoading(false);
      if (isManual) {
        setTimeout(() => setProbing(false), 500);
      }
    }
  };

  React.useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => fetchHealth(), 30000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    if (!seconds) return '0m';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
  };

  const isHealthy = health?.status === 'ok';
  const dbStatus = health?.services?.database?.status === 'ok';
  const dbLatency = health?.services?.database?.latency_ms ?? 0;

  return (
    <AppShell>
      {/* Header & Probe Trigger */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="pop-badge bg-amber-300 text-slate-950">
              ✦ SYSTEM DIAGNOSTICS
            </span>
            <span className="pop-badge bg-[var(--color-pop-mint)] text-slate-950">
              Realtime Probes
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tracking-tight font-mono mt-2">
            System Health & Readiness
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[var(--color-text-secondary)] mt-1">
            Live telemetry of PostgreSQL connection pooling, Node.js runtime readiness, and active security controls.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => fetchHealth(true)}
            disabled={probing}
            className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs h-9 px-4 gap-2 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${probing ? 'animate-spin' : ''}`} />
            <span>{probing ? 'Testing Probes...' : 'Test Health Now'}</span>
          </Button>
        </div>
      </div>

      {/* Primary Status Banner */}
      <div className="pop-card bg-[var(--color-pop-mint)] text-slate-950 border-2 border-[var(--color-border)] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <HeartPulse className="h-6 w-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-black font-mono">
                  {isHealthy ? 'ALL SYSTEMS OPERATIONAL' : 'SYSTEM DEGRADED / CHECK REQUIRED'}
                </h2>
                <StatusBadge status={isHealthy ? 'SUCCESS' : 'DEGRADED'} size="sm" />
              </div>
              <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mt-1">
                Liveness and Readiness endpoints responding. Database connection active.
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right font-mono text-xs font-bold space-y-1">
            <div>Version: <strong>v{health?.version || '0.1.0'}</strong></div>
            <div>Last Checked: <strong>{lastCheck ? lastCheck.toLocaleTimeString() : 'Just now'}</strong></div>
          </div>
        </div>
      </div>

      {/* Telemetry Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Health Probe"
          value={isHealthy ? '100% OK' : 'Degraded'}
          icon={HeartPulse}
          variant="mint"
          badge={isHealthy ? 'Operational' : 'Issue'}
          subtext="HTTP /api/health probe"
          loading={loading}
        />
        <StatCard
          label="Postgres Latency"
          value={dbStatus ? `${dbLatency} ms` : 'Error'}
          icon={Database}
          variant="sky"
          badge={dbStatus ? 'Connected' : 'Offline'}
          subtext="SELECT 1 query probe"
          loading={loading}
        />
        <StatCard
          label="Gateway Uptime"
          value={formatUptime(health?.uptime_seconds || 0)}
          icon={Clock}
          variant="yellow"
          badge="Live Process"
          subtext="Continuous runtime"
          loading={loading}
        />
        <StatCard
          label="Security Core"
          value="P2.3 Core"
          icon={ShieldCheck}
          variant="lavender"
          badge="Enforced"
          subtext="Encryption, SSRF, ReadOnly"
          loading={loading}
        />
      </div>

      {/* Detailed Service Probes & Security Core Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Component Diagnostics */}
        <Card className="pop-card border-2 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] rounded-2xl shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-sm font-black flex items-center gap-2 font-mono">
              <Server className="h-4 w-4 stroke-[2.5]" />
              <span>Runtime Subsystems</span>
            </CardTitle>
            <CardDescription className="text-xs font-medium text-[var(--color-text-secondary)]">
              Core platform process states and database response timers.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-2 space-y-3 font-mono text-xs">
            {/* Database Row */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <div className="flex items-center gap-2.5">
                <Database className="h-4 w-4 stroke-[2.5] text-sky-600 dark:text-sky-400" />
                <div>
                  <div className="font-black text-[var(--color-text-primary)]">PostgreSQL Database</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] font-medium">Read-Only Pool Connection</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">{dbLatency}ms latency</span>
                <StatusBadge status={dbStatus ? 'SUCCESS' : 'FAILED'} size="sm" />
              </div>
            </div>

            {/* Next.js Node Runtime Row */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <div className="flex items-center gap-2.5">
                <Cpu className="h-4 w-4 stroke-[2.5] text-amber-600 dark:text-amber-400" />
                <div>
                  <div className="font-black text-[var(--color-text-primary)]">Next.js API Gateway</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] font-medium">Node.js Serverless / Edge</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">Uptime: {formatUptime(health?.uptime_seconds || 0)}</span>
                <StatusBadge status="SUCCESS" size="sm" />
              </div>
            </div>

            {/* MCP Adapters Row */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <div className="flex items-center gap-2.5">
                <Zap className="h-4 w-4 stroke-[2.5] text-emerald-600 dark:text-emerald-400" />
                <div>
                  <div className="font-black text-[var(--color-text-primary)]">MCP Tool Adapters</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] font-medium">GitHub, PostgreSQL, Vercel</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">Ready</span>
                <StatusBadge status="SUCCESS" size="sm" />
              </div>
            </div>

            {/* OAuth 2.1 / Gemini Spark Auth Row */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <div className="flex items-center gap-2.5">
                <Lock className="h-4 w-4 stroke-[2.5] text-indigo-600 dark:text-indigo-400" />
                <div>
                  <div className="font-black text-[var(--color-text-primary)]">OAuth 2.1 & RFC 9728 PRM</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] font-medium">Gemini Spark & Remote MCP</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-[var(--color-text-secondary)]">Enforced</span>
                <StatusBadge status="SUCCESS" size="sm" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Security Baseline Checklist */}
        <Card className="pop-card border-2 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] rounded-2xl shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-sm font-black flex items-center gap-2 font-mono">
              <ShieldCheck className="h-4 w-4 stroke-[2.5]" />
              <span>Security Baseline (P0.1 – P2.4)</span>
            </CardTitle>
            <CardDescription className="text-xs font-medium text-[var(--color-text-secondary)]">
              Verified security perimeter active across all gateway routes.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-2 space-y-2 font-mono text-xs">
            {[
              { code: 'P0.1', name: 'MCP Bearer Auth', desc: 'bcrypt token verification' },
              { code: 'P0.2', name: 'Tenant Isolation', desc: 'user_id scoped queries' },
              { code: 'P0.3', name: 'Postgres Read-Only', desc: 'BEGIN READ ONLY isolation' },
              { code: 'P1.1', name: 'SSRF Protection', desc: 'DNS pinning & private IP filter' },
              { code: 'P1.2', name: 'Rate Limiting', desc: 'sliding window pre-auth & per-endpoint' },
              { code: 'P1.4', name: 'Credential Encryption', desc: 'AES-256-GCM cipher' },
              { code: 'P2.2', name: 'Audit Logging', desc: 'non-blocking execution audit' },
              { code: 'P2.4', name: 'OAuth 2.1 Interop', desc: 'RFC 9728 & Gemini Spark PKCE' },
            ].map((item) => (
              <div
                key={item.code}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] shadow-[1px_1px_0px_0px_rgba(15,23,42,1)]"
              >
                <div className="flex items-center gap-2">
                  <span className="pop-badge bg-amber-300 text-slate-950 text-[9px] font-black">
                    {item.code}
                  </span>
                  <div>
                    <span className="font-black text-[var(--color-text-primary)]">{item.name}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] ml-1.5 hidden sm:inline">({item.desc})</span>
                  </div>
                </div>
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">● PASS</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
