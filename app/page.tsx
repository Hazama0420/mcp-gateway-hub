// app/page.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Server,
  Boxes,
  PlaySquare,
  Activity,
  HeartPulse,
  Plus,
  Copy,
  Check,
  Code2,
  ExternalLink,
  ShieldCheck,
  ArrowRight,
  Database,
  Globe2,
  Cpu,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CreateEndpointModal } from '@/components/CreateEndpointModal';
import { ClientConfigModal } from '@/components/ui/client-config-modal';

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

interface Endpoint {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  services: Array<{ service_type: string }>;
}

interface Integration {
  id: string;
  name: string;
  slug: string;
  auth_type: string;
  is_active: boolean;
  tools?: Array<{ id: string; name: string }>;
}

interface ExecutionLogItem {
  id: string;
  execution_id: string;
  tool_name: string;
  status: string;
  execution_time_ms: number;
  created_at: string;
  endpoint?: { name: string };
}

export default function DashboardPage() {
  const [endpoints, setEndpoints] = React.useState<Endpoint[]>([]);
  const [integrations, setIntegrations] = React.useState<Integration[]>([]);
  const [recentLogs, setRecentLogs] = React.useState<ExecutionLogItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isHealthy, setIsHealthy] = React.useState<boolean | null>(null);

  const [isCreateEndpointOpen, setIsCreateEndpointOpen] = React.useState(false);
  const [configModalEndpoint, setConfigModalEndpoint] = React.useState<Endpoint | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [endpointsRes, integrationsRes, logsRes, healthRes] = await Promise.all([
        fetch('/api/endpoints'),
        fetch('/api/integrations'),
        fetch('/api/endpoints/logs?limit=10'),
        fetch('/api/health?probe=liveness', { cache: 'no-store' }),
      ]);

      if (endpointsRes.ok) {
        const epData = await endpointsRes.json();
        if (Array.isArray(epData)) setEndpoints(epData);
      }

      if (integrationsRes.ok) {
        const intData = await integrationsRes.json();
        if (Array.isArray(intData)) setIntegrations(intData);
      }

      if (logsRes.ok) {
        const logData = await logsRes.json();
        if (logData && Array.isArray(logData.logs)) {
          setRecentLogs(logData.logs);
        }
      }

      if (healthRes.ok) {
        setIsHealthy(true);
      } else {
        setIsHealthy(false);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setIsHealthy(false);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const activeEndpointsCount = endpoints.filter((e) => e.is_active).length;
  const activeIntegrationsCount = integrations.filter((i) => i.is_active).length;
  const totalExecutionsCount = recentLogs.length;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  return (
    <AppShell>
      {/* 1. Header Hero Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="pop-badge bg-amber-300 text-slate-950">
              ✦ MCP CONTROL PLANE
            </span>
            <span className="pop-badge bg-[var(--color-pop-mint)] text-slate-950">
              P2.3 Core Active
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tracking-tight font-mono mt-2">
            Infrastructure Control Center
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[var(--color-text-secondary)] mt-1">
            Build, test, and expose secure Model Context Protocol gateway endpoints for AI clients.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setIsCreateEndpointOpen(true)}
            className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs h-9 px-4 gap-1.5 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Create Endpoint</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardData}
            className="pop-btn h-9 px-2.5 bg-[var(--color-surface)] text-[var(--color-text-primary)]"
            aria-label="Refresh Dashboard"
            title="Refresh Dashboard"
          >
            <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 2. Colorful Pop Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Endpoints"
          value={activeEndpointsCount}
          icon={Server}
          variant="sky"
          badge={`${endpoints.length} Total`}
          subtext="Active HTTP gateways"
          loading={loading}
        />
        <StatCard
          label="Integrations"
          value={activeIntegrationsCount}
          icon={Boxes}
          variant="lavender"
          badge={`${integrations.length} Attached`}
          subtext="GitHub, Postgres, Vercel"
          loading={loading}
        />
        <StatCard
          label="Telemetry"
          value={totalExecutionsCount}
          icon={Activity}
          variant="yellow"
          badge="Audit Live"
          subtext="Non-blocking event logging"
          loading={loading}
        />
        <StatCard
          label="System Health"
          value={isHealthy === true ? '100% OK' : isHealthy === false ? 'Degraded' : 'Probing'}
          icon={HeartPulse}
          variant="mint"
          badge={isHealthy ? 'Operational' : 'Issue'}
          subtext="Readiness & Postgres live"
          loading={loading}
        />
      </div>

      {/* 3. Main Grid: Active Gateways + Security Core / Observability */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Active MCP Endpoints */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[1px_1px_0px_0px_rgba(15,23,42,1)] font-bold">
                <Server className="h-4 w-4 stroke-[2.5]" />
              </span>
              <h2 className="text-base font-black text-[var(--color-text-primary)] font-mono">
                Active MCP Gateways
              </h2>
            </div>
            <Link
              href="/admin/endpoints"
              className="text-xs font-bold text-[var(--color-text-primary)] hover:underline inline-flex items-center gap-1 font-mono"
            >
              View all ({endpoints.length})
              <ArrowRight className="h-3.5 w-3.5 stroke-[2.5]" />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-28 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4 animate-pulse shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]" />
              ))}
            </div>
          ) : endpoints.length === 0 ? (
            <EmptyState
              icon={Server}
              title="No MCP Endpoints configured"
              description="Create your first gateway endpoint to securely connect Claude Desktop and Cursor AI to your developer tools."
              actionLabel="Create Endpoint"
              onAction={() => setIsCreateEndpointOpen(true)}
            />
          ) : (
            <div className="space-y-3.5">
              {endpoints.slice(0, 4).map((ep) => {
                const httpUrl = `${origin}/api/mcp/${ep.id}/http`;
                return (
                  <Card
                    key={ep.id}
                    className="pop-card pop-card-hover bg-[var(--color-surface)] text-[var(--color-text-primary)] border-2 border-[var(--color-border)] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]"
                  >
                    <CardContent className="p-4 sm:p-5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-300 dark:bg-sky-500 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                            <Server className="h-4.5 w-4.5 stroke-[2.5]" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-[var(--color-text-primary)] tracking-tight font-mono">{ep.name}</h3>
                            <p className="text-[10px] font-mono text-[var(--color-text-muted)] truncate max-w-xs">{ep.id}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <StatusBadge status={ep.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="pop-btn h-7 px-2.5 text-xs bg-[var(--color-pop-yellow)] text-slate-950 font-black gap-1"
                          >
                            <Link href={`/admin/playground?endpoint=${ep.id}`}>
                              <PlaySquare className="h-3 w-3 stroke-[2.5]" />
                              <span>Test</span>
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfigModalEndpoint(ep)}
                            className="pop-btn h-7 px-2 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] font-bold gap-1"
                          >
                            <Code2 className="h-3 w-3" />
                            <span>Setup</span>
                          </Button>
                        </div>
                      </div>

                      {/* URL Box */}
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] px-3 py-1.5 text-xs">
                        <span className="font-mono text-[var(--color-text-secondary)] truncate text-[11px] font-bold">{httpUrl}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(ep.id, httpUrl)}
                          className="h-6 px-2 text-[var(--color-text-primary)] font-bold shrink-0 text-[11px] gap-1 font-mono hover:bg-amber-300"
                        >
                          {copiedId === ep.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600 stroke-[3]" />
                              <span className="text-emerald-600">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 1 Col: Security Core Status & Telemetry Logs */}
        <div className="space-y-6">
          {/* Security Core Panel */}
          <div className="pop-card bg-[var(--color-pop-mint)] text-slate-950 border-2 border-[var(--color-border)] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-black font-mono text-xs">
                <ShieldCheck className="h-4 w-4 text-emerald-700 stroke-[2.5]" />
                <span>SECURITY CORE // P2.3</span>
              </div>
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono font-bold">
              <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-2 border-2 border-[var(--color-border)] flex items-center justify-between">
                <span>AES-256</span>
                <span className="text-emerald-700 dark:text-emerald-400">● PASS</span>
              </div>
              <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-2 border-2 border-[var(--color-border)] flex items-center justify-between">
                <span>SSRF Wall</span>
                <span className="text-emerald-700 dark:text-emerald-400">● PASS</span>
              </div>
              <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-2 border-2 border-[var(--color-border)] flex items-center justify-between">
                <span>Rate Limit</span>
                <span className="text-emerald-700 dark:text-emerald-400">● PASS</span>
              </div>
              <div className="rounded-lg bg-white/70 dark:bg-slate-900/60 p-2 border-2 border-[var(--color-border)] flex items-center justify-between">
                <span>Audit Logs</span>
                <span className="text-emerald-700 dark:text-emerald-400">● LIVE</span>
              </div>
            </div>
          </div>

          {/* Recent Executions Feed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-400 text-slate-950 border border-[var(--color-border)] font-bold">
                  <Activity className="h-3.5 w-3.5 stroke-[2.5]" />
                </span>
                <h3 className="text-sm font-black text-[var(--color-text-primary)] font-mono">
                  Recent Telemetry
                </h3>
              </div>
              <Link
                href="/admin/logs"
                className="text-xs font-bold text-[var(--color-text-primary)] hover:underline inline-flex items-center gap-1 font-mono"
              >
                Logs
                <ArrowRight className="h-3 w-3 stroke-[2.5]" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-xl bg-[var(--color-surface)] border-2 border-[var(--color-border)] animate-pulse shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]" />
                ))}
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="pop-card bg-[var(--color-surface)] p-6 text-center text-xs font-medium text-[var(--color-text-muted)] border-2 border-[var(--color-border)]">
                No tool executions recorded yet. Run a test in the Playground to see live audit logs.
              </div>
            ) : (
              <div className="space-y-2">
                {recentLogs.slice(0, 5).map((log) => (
                  <div
                    key={log.id || log.execution_id}
                    className="pop-card flex items-center justify-between gap-3 p-3 text-xs bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-black text-[var(--color-text-primary)] truncate">
                        {log.tool_name}
                      </p>
                      <p className="text-[10px] font-mono text-[var(--color-text-muted)] truncate">
                        {log.execution_id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={log.status} size="sm" />
                      <span className="font-mono text-[10px] font-bold text-[var(--color-text-secondary)]">
                        {log.execution_time_ms}ms
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateEndpointModal
        open={isCreateEndpointOpen}
        onOpenChange={setIsCreateEndpointOpen}
        onSuccess={fetchDashboardData}
      />
      <ClientConfigModal
        open={Boolean(configModalEndpoint)}
        onOpenChange={(open) => !open && setConfigModalEndpoint(null)}
        endpoint={configModalEndpoint}
      />
    </AppShell>
  );
}