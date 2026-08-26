// app/page.tsx
'use client';

import {
  useEffect,
  useMemo,
  useState,
  type ElementType,
} from 'react';

import Link from 'next/link';

import {
  Activity,
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  Globe2,
  MoreHorizontal,
  Plus,
  Server,
  Settings2,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import {
  AppNavigation,
  MobileNavigation,
} from '@/components/AppNavigation';

import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateEndpointModal } from '@/components/CreateEndpointModal';

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
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
  services: {
    service_type: string;
  }[];
}

interface Log {
  id: string;
  tool_name: string;
  status: string; // <-- Diubah dari 'success' | 'error' ke string karena database mencatat HTTP Code
  execution_time_ms: number;
  created_at: string;
}

interface ServiceMeta {
  label: string;
  icon: ElementType;
}

const serviceMeta: Record<string, ServiceMeta> = {
  github: {
    label: 'GitHub',
    icon: GithubIcon,
  },
  postgres: {
    label: 'PostgreSQL',
    icon: Database,
  },
  supabase: {
    label: 'Supabase',
    icon: Database,
  },
  vercel: {
    label: 'Vercel',
    icon: Globe2,
  },
};

export default function DashboardPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [selectedEndpoint, setSelectedEndpoint] =
    useState<Endpoint | null>(null);

  const [deleteEndpoint, setDeleteEndpoint] =
    useState<Endpoint | null>(null);

  const [deleting, setDeleting] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [endpointsRes, logsRes] =
        await Promise.all([
          fetch('/api/endpoints'),
          fetch('/api/endpoints/logs?limit=20'),
        ]);

      if (endpointsRes.ok) {
        const data = await endpointsRes.json();

        if (Array.isArray(data)) {
          setEndpoints(data);
        }
      }

      if (logsRes.ok) {
        const data = await logsRes.json();
        // Cek struktur response dari logs (data.logs atau langsung data)
        const logsData = data.logs ? data.logs : data;
        
        if (Array.isArray(logsData)) {
          setLogs(logsData);
        }
      }
    } catch (error) {
      console.error(
        'Failed to fetch dashboard data:',
        error
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getHttpUrl = (id: string): string => {
    if (typeof window === 'undefined') {
      return '';
    }

    return `${window.location.origin}/api/mcp/${id}/http`;
  };

  const getSseUrl = (id: string): string => {
    if (typeof window === 'undefined') {
      return '';
    }

    return `${window.location.origin}/api/mcp/${id}/sse`;
  };

  const handleEndpointCreated = () => {
    setIsModalOpen(false);
    fetchData();
  };

  const handleCopy = async (
    id: string,
    url: string
  ) => {
    if (!url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);

      setCopiedId(id);

      window.setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch (error) {
      console.error(
        'Failed to copy URL:',
        error
      );
    }
  };

  const handleOpenEndpoint = (url: string) => {
    if (!url) {
      return;
    }

    window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleDeleteEndpoint = async () => {
    if (!deleteEndpoint) {
      return;
    }

    setDeleting(true);

    try {
      const response = await fetch(
        `/api/endpoints?id=${encodeURIComponent(
          deleteEndpoint.id
        )}`,
        {
          method: 'DELETE',
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Failed to delete endpoint'
        );
      }

      setEndpoints((current) =>
        current.filter(
          (endpoint) =>
            endpoint.id !==
            deleteEndpoint.id
        )
      );

      if (
        selectedEndpoint?.id ===
        deleteEndpoint.id
      ) {
        setSelectedEndpoint(null);
      }

      setDeleteEndpoint(null);

      await fetchData();
    } catch (error) {
      console.error(
        'Failed to delete endpoint:',
        error
      );

      window.alert(
        error instanceof Error
          ? error.message
          : 'Failed to delete endpoint'
      );
    } finally {
      setDeleting(false);
    }
  };

  const stats = useMemo(() => {
    const active =
      endpoints.filter(
        (endpoint) => endpoint.is_active
      ).length;

    // Perbaiki pengecekan success status karena sekarang tercatat sebagai HTTP status (200 OK)
    const successfulLogs =
      logs.filter(
        (log) => String(log.status).startsWith('2') || log.status === 'OK' || log.status === 'success'
      ).length;

    const averageExecutionTime =
      logs.length > 0
        ? Math.round(
            logs.reduce(
              (sum, log) =>
                sum + log.execution_time_ms,
              0
            ) / logs.length
          )
        : 0;

    const successRate =
      logs.length > 0
        ? Math.round(
            (successfulLogs / logs.length) * 100
          )
        : 0;

    return {
      total: endpoints.length,
      active,
      executions: logs.length,
      averageExecutionTime,
      successRate,
    };
  }, [endpoints, logs]);

  return (
    <div className="min-h-screen bg-[#060b10] text-white">
      <div className="flex min-h-screen">
        <AppNavigation />

        <div className="min-w-0 flex-1">
          <MobileNavigation />

          <div className="relative">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
              <div className="absolute left-[-8%] top-[-10%] h-[420px] w-[420px] rounded-full bg-emerald-500/10 blur-[120px]" />
              <div className="absolute right-[-8%] top-0 h-[400px] w-[400px] rounded-full bg-cyan-500/10 blur-[120px]" />
              <div className="absolute bottom-[-10%] left-[35%] h-[350px] w-[350px] rounded-full bg-blue-500/5 blur-[120px]" />
            </div>

            <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                    MCP Gateway Online
                  </div>

                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    Gateway
                    <span className="text-emerald-400">
                      .
                    </span>
                  </h1>

                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
                    One secure gateway for your MCP
                    services, tools, and AI clients.
                  </p>
                </div>

                {/* Action Buttons Group */}
                <div className="flex flex-wrap items-center gap-3">
                  <Link href="/admin/playground">
                    <Button
                      variant="outline"
                      className="h-11 rounded-xl border-white/10 bg-white/[0.03] px-4 font-medium text-slate-300 backdrop-blur-sm transition hover:border-emerald-500/30 hover:bg-white/[0.07] hover:text-white"
                    >
                      <Terminal className="mr-2 h-4 w-4 text-emerald-400" />
                      Tool Playground
                    </Button>
                  </Link>

                  <Button
                    onClick={() =>
                      setIsModalOpen(true)
                    }
                    className="h-11 rounded-xl bg-emerald-500 px-5 font-medium text-slate-950 shadow-lg shadow-emerald-500/10 hover:bg-emerald-400"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Endpoint
                  </Button>
                </div>
              </div>

              <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Total Endpoints"
                  value={
                    loading
                      ? '—'
                      : stats.total
                  }
                  description="Configured gateways"
                  icon={Server}
                />

                <StatCard
                  title="Active"
                  value={
                    loading
                      ? '—'
                      : stats.active
                  }
                  description="Currently available"
                  icon={Zap}
                  accent="emerald"
                />

                <StatCard
                  title="Executions"
                  value={
                    loading
                      ? '—'
                      : stats.executions
                  }
                  description="Recent tool calls"
                  icon={Activity}
                />

                <StatCard
                  title="Avg. Response"
                  value={
                    loading
                      ? '—'
                      : `${stats.averageExecutionTime}ms`
                  }
                  description={
                    stats.successRate > 0
                      ? `${stats.successRate}% success rate`
                      : 'No executions yet'
                  }
                  icon={Clock3}
                />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                <Card className="overflow-hidden rounded-3xl border-white/[0.07] bg-white/[0.025] shadow-2xl shadow-black/30 backdrop-blur-xl">
                  <CardHeader className="border-b border-white/[0.06] px-6 py-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-lg text-white">
                          Your Endpoints
                        </CardTitle>

                        <p className="mt-1 text-sm text-slate-500">
                          Deploy and manage your MCP
                          connections.
                        </p>
                      </div>

                      <Badge
                        variant="outline"
                        className="border-white/10 bg-white/[0.03] text-slate-400"
                      >
                        {endpoints.length} total
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    {loading ? (
                      <div className="space-y-4 p-6">
                        <EndpointSkeleton />
                        <EndpointSkeleton />
                        <EndpointSkeleton />
                      </div>
                    ) : endpoints.length === 0 ? (
                      <EmptyState
                        onCreate={() =>
                          setIsModalOpen(true)
                        }
                      />
                    ) : (
                      <ScrollArea className="h-[650px]">
                        <div className="divide-y divide-white/[0.06]">
                          {endpoints.map(
                            (endpoint) => {
                              const httpUrl =
                                getHttpUrl(
                                  endpoint.id
                                );

                              const sseUrl =
                                getSseUrl(
                                  endpoint.id
                                );

                              return (
                                <EndpointCard
                                  key={endpoint.id}
                                  endpoint={endpoint}
                                  url={httpUrl}
                                  copied={
                                    copiedId ===
                                    endpoint.id
                                  }
                                  onCopy={() =>
                                    handleCopy(
                                      endpoint.id,
                                      httpUrl
                                    )
                                  }
                                  onCopySse={() =>
                                    handleCopy(
                                      `${endpoint.id}-sse`,
                                      sseUrl
                                    )
                                  }
                                  onOpen={() =>
                                    handleOpenEndpoint(
                                      httpUrl
                                    )
                                  }
                                  onManage={() =>
                                    setSelectedEndpoint(
                                      endpoint
                                    )
                                  }
                                  onDelete={() =>
                                    setDeleteEndpoint(
                                      endpoint
                                    )
                                  }
                                />
                              );
                            }
                          )}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden rounded-3xl border-white/[0.07] bg-white/[0.025] shadow-2xl shadow-black/30 backdrop-blur-xl">
                  <CardHeader className="border-b border-white/[0.06] px-6 py-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg text-white">
                          Recent Activity
                        </CardTitle>

                        <p className="mt-1 text-sm text-slate-500">
                          Latest MCP tool executions.
                        </p>
                      </div>

                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03]">
                        <Activity className="h-4 w-4 text-emerald-400" />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    {loading ? (
                      <div className="space-y-4 p-6">
                        <ActivitySkeleton />
                        <ActivitySkeleton />
                        <ActivitySkeleton />
                      </div>
                    ) : logs.length === 0 ? (
                      <div className="flex min-h-[440px] flex-col items-center justify-center px-6 text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025]">
                          <Terminal className="h-6 w-6 text-slate-600" />
                        </div>

                        <h3 className="text-sm font-medium text-white">
                          No activity yet
                        </h3>

                        <p className="mt-2 max-w-[250px] text-sm leading-5 text-slate-500">
                          Tool executions will appear here
                          once an MCP client starts using
                          your endpoint.
                        </p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[650px]">
                        <div className="divide-y divide-white/[0.06]">
                          {logs.map((log) => (
                            <ActivityRow
                              key={log.id}
                              log={log}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
                    <Settings2 className="h-4 w-4 text-slate-500" />
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-300">
                      Streamable HTTP
                    </p>

                    <p className="text-xs text-slate-600">
                      Recommended for modern MCP clients
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                  Production endpoint ready
                </div>
              </div>
            </main>

            <CreateEndpointModal
              open={isModalOpen}
              onOpenChange={setIsModalOpen}
              onSuccess={handleEndpointCreated}
            />

            {selectedEndpoint && (
              <EndpointManagePanel
                endpoint={selectedEndpoint}
                httpUrl={getHttpUrl(
                  selectedEndpoint.id
                )}
                sseUrl={getSseUrl(
                  selectedEndpoint.id
                )}
                copied={
                  copiedId ===
                  `manage-${selectedEndpoint.id}`
                }
                onClose={() =>
                  setSelectedEndpoint(null)
                }
                onCopy={(url) =>
                  handleCopy(
                    `manage-${selectedEndpoint.id}`,
                    url
                  )
                }
                onOpen={() =>
                  handleOpenEndpoint(
                    getHttpUrl(
                      selectedEndpoint.id
                    )
                  )
                }
                onDelete={() => {
                  setSelectedEndpoint(null);
                  setDeleteEndpoint(
                    selectedEndpoint
                  );
                }}
              />
            )}

            {deleteEndpoint && (
              <DeleteConfirmDialog
                endpoint={deleteEndpoint}
                deleting={deleting}
                onCancel={() =>
                  deleting
                    ? null
                    : setDeleteEndpoint(null)
                }
                onConfirm={
                  handleDeleteEndpoint
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: ElementType;
  accent?: 'emerald';
}) {
  return (
    <Card className="rounded-2xl border-white/[0.07] bg-white/[0.025] shadow-xl shadow-black/10 backdrop-blur-xl">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">
              {title}
            </p>

            <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
              {value}
            </p>

            <p className="mt-1 text-xs text-slate-600">
              {description}
            </p>
          </div>

          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
              accent === 'emerald'
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                : 'border-white/[0.07] bg-white/[0.03] text-slate-500'
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EndpointCard({
  endpoint,
  url,
  copied,
  onCopy,
  onCopySse,
  onOpen,
  onManage,
  onDelete,
}: {
  endpoint: Endpoint;
  url: string;
  copied: boolean;
  onCopy: () => void;
  onCopySse: () => void;
  onOpen: () => void;
  onManage: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="p-5 transition duration-200 hover:bg-white/[0.018] sm:p-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.06]">
              <div className="absolute inset-0 rounded-2xl bg-emerald-500/5 blur-xl" />

              <Server className="relative h-5 w-5 text-emerald-400" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-white">
                  {endpoint.name}
                </h3>

                <Badge
                  className={
                    endpoint.is_active
                      ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border border-white/[0.07] bg-white/[0.03] text-slate-500'
                  }
                >
                  <span
                    className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                      endpoint.is_active
                        ? 'bg-emerald-400'
                        : 'bg-slate-600'
                    }`}
                  />

                  {endpoint.is_active
                    ? 'Active'
                    : 'Inactive'}
                </Badge>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-mono">
                  {endpoint.id.slice(0, 8)}
                </span>

                <span>•</span>

                <span>
                  Created{' '}
                  {formatDistanceToNow(
                    new Date(
                      endpoint.created_at
                    ),
                    {
                      addSuffix: true,
                    }
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="relative shrink-0">
            <details className="group">
              <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-transparent text-slate-600 outline-none hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-white">
                <MoreHorizontal className="h-4 w-4" />
              </summary>

              <div className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a1016] p-1.5 shadow-2xl shadow-black/40">
                <button
                  type="button"
                  onClick={onCopy}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <Copy className="h-4 w-4 text-slate-500" />
                  Copy HTTP URL
                </button>

                <button
                  type="button"
                  onClick={onCopySse}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <Copy className="h-4 w-4 text-slate-500" />
                  Copy SSE URL
                </button>

                <button
                  type="button"
                  onClick={onOpen}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <ExternalLink className="h-4 w-4 text-slate-500" />
                  Open MCP Endpoint
                </button>

                <div className="my-1.5 border-t border-white/[0.06]" />

                <button
                  type="button"
                  onClick={onManage}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-emerald-400 transition hover:bg-emerald-500/10"
                >
                  <Settings2 className="h-4 w-4" />
                  Manage Endpoint
                </button>

                <button
                  type="button"
                  onClick={onDelete}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-red-400 transition hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Endpoint
                </button>
              </div>
            </details>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {endpoint.services.map(
            (service) => {
              const meta =
                serviceMeta[
                  service.service_type
                ] ?? {
                  label:
                    service.service_type,
                  icon: Database,
                };

              const Icon = meta.icon;

              return (
                <div
                  key={service.service_type}
                  className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-xs text-slate-400"
                >
                  <Icon className="h-3.5 w-3.5 text-slate-500" />
                  {meta.label}
                </div>
              );
            }
          )}

          <div className="flex items-center gap-1.5 rounded-xl border border-cyan-500/10 bg-cyan-500/5 px-2.5 py-1.5 text-xs text-cyan-400">
            <Zap className="h-3.5 w-3.5" />
            Streamable HTTP
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              MCP Endpoint
            </span>

            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Ready
            </span>
          </div>

          <div className="flex items-center gap-3">
            <code className="min-w-0 flex-1 truncate text-xs text-slate-400">
              {url}
            </code>

            <Button
              variant="outline"
              size="sm"
              className="shrink-0 rounded-xl border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white"
              onClick={onCopy}
            >
              {copied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Compatible with modern MCP clients
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="rounded-xl text-red-400/80 hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onManage}
              className="rounded-xl text-slate-400 hover:bg-white/[0.05] hover:text-white"
            >
              Manage
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EndpointManagePanel({
  endpoint,
  httpUrl,
  sseUrl,
  copied,
  onClose,
  onCopy,
  onOpen,
  onDelete,
}: {
  endpoint: Endpoint;
  httpUrl: string;
  sseUrl: string;
  copied: boolean;
  onClose: () => void;
  onCopy: (url: string) => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        aria-label="Close endpoint manager"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col border-l border-white/[0.08] bg-[#080e14] shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between border-b border-white/[0.06] p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
              <Server className="relative h-5 w-5 text-emerald-400" />
            </div>

            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-white">
                {endpoint.name}
              </h2>

              <p className="mt-1 truncate font-mono text-xs text-slate-600">
                {endpoint.id}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0 rounded-xl text-slate-600 hover:bg-white/[0.05] hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-5 p-6">
            <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                <Zap className="h-4 w-4" />
                Streamable HTTP
              </div>

              <p className="mt-2 text-xs leading-5 text-slate-500">
                Recommended endpoint for Gemini Spark
                and modern MCP clients.
              </p>

              <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-3">
                <code className="break-all text-xs leading-5 text-slate-400">
                  {httpUrl}
                </code>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  onClick={() =>
                    onCopy(httpUrl)
                  }
                  className="rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                >
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy URL
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={onOpen}
                  className="rounded-xl border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <Activity className="h-4 w-4 text-slate-500" />
                Legacy SSE
              </div>

              <p className="mt-2 text-xs leading-5 text-slate-600">
                Compatibility endpoint for older MCP
                clients.
              </p>

              <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-3">
                <code className="break-all text-xs leading-5 text-slate-500">
                  {sseUrl}
                </code>
              </div>

              <Button
                variant="outline"
                onClick={() =>
                  onCopy(sseUrl)
                }
                className="mt-3 w-full rounded-xl border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy SSE URL
              </Button>
            </div>

            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Connected Services
                  </p>

                  <p className="mt-1 text-xs text-slate-600">
                    Services exposed by this endpoint.
                  </p>
                </div>

                <Database className="h-4 w-4 text-slate-600" />
              </div>

              {endpoint.services.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {endpoint.services.map(
                    (service) => {
                      const meta =
                        serviceMeta[
                          service.service_type
                        ] ?? {
                          label:
                            service.service_type,
                          icon: Database,
                        };

                      const Icon =
                        meta?.icon ??
                        Database;

                      const label =
                        meta?.label ??
                        service.service_type;

                      return (
                        <div
                          key={
                            service.service_type
                          }
                          className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-xs text-slate-400"
                        >
                          <Icon className="h-3.5 w-3.5 text-slate-500" />
                          {label}
                        </div>
                      );
                    }
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  No connected services.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Endpoint status
                  </p>

                  <p className="mt-1 text-xs text-slate-600">
                    Current availability.
                  </p>
                </div>

                <Badge
                  className={
                    endpoint.is_active
                      ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border border-white/[0.07] bg-white/[0.03] text-slate-500'
                  }
                >
                  <span
                    className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                      endpoint.is_active
                        ? 'bg-emerald-400'
                        : 'bg-slate-600'
                    }`}
                  />

                  {endpoint.is_active
                    ? 'Active'
                    : 'Inactive'}
                </Badge>
              </div>
            </div>

            <div className="rounded-3xl border border-red-500/10 bg-red-500/[0.03] p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                  <Trash2 className="h-4 w-4 text-red-400" />
                </div>

                <div className="flex-1">
                  <p className="text-sm font-medium text-red-300">
                    Danger zone
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Deleting this endpoint removes its
                    configuration from the dashboard.
                  </p>

                  <Button
                    variant="outline"
                    onClick={onDelete}
                    className="mt-4 rounded-xl border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Endpoint
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </aside>
    </div>
  );
}

function DeleteConfirmDialog({
  endpoint,
  deleting,
  onCancel,
  onConfirm,
}: {
  endpoint: Endpoint;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close delete dialog"
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={() => {
          if (!deleting) {
            onCancel();
          }
        }}
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0a1016] shadow-2xl shadow-black/60">
        <div className="p-6">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10">
            <AlertTriangle className="h-6 w-6 text-red-400" />
          </div>

          <h2 className="text-xl font-semibold text-white">
            Delete endpoint?
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            You are about to permanently delete
            <span className="font-medium text-slate-200">
              {' '}
              {endpoint.name}
            </span>
            . This action cannot be undone.
          </p>

          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-3">
            <p className="font-mono text-xs text-slate-600">
              {endpoint.id}
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {endpoint.services.map(
                (service) => (
                  <Badge
                    key={
                      service.service_type
                    }
                    variant="outline"
                    className="border-white/[0.07] bg-white/[0.02] text-slate-500"
                  >
                    {service.service_type}
                  </Badge>
                )
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-white/[0.06] bg-white/[0.02] p-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            disabled={deleting}
            onClick={onCancel}
            className="rounded-xl border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
          >
            Cancel
          </Button>

          <Button
            disabled={deleting}
            onClick={onConfirm}
            className="rounded-xl bg-red-500 text-white hover:bg-red-400"
          >
            <Trash2 className="mr-2 h-4 w-4" />

            {deleting
              ? 'Deleting...'
              : 'Delete Endpoint'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({
  log,
}: {
  log: Log;
}) {
  const isSuccess = String(log.status).startsWith('2') || log.status === 'OK' || log.status === 'success';

  return (
    <div className="p-5 transition hover:bg-white/[0.018]">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            isSuccess
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-red-500/10 text-red-400'
          }`}
        >
          {isSuccess ? (
            <Check className="h-4 w-4" />
          ) : (
            <Activity className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-medium text-slate-300">
                {log.tool_name}
              </p>

              <p className="mt-1 text-xs text-slate-600">
                {formatDistanceToNow(
                  new Date(log.created_at),
                  {
                    addSuffix: true,
                  }
                )}
              </p>
            </div>

            <Badge
              variant="outline"
              className={
                isSuccess
                  ? 'border-emerald-500/20 text-emerald-400'
                  : 'border-red-500/20 text-red-400'
              }
            >
              {log.status}
            </Badge>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <Clock3 className="h-3.5 w-3.5" />
            {log.execution_time_ms}ms
          </div>
        </div>
      </div>
    </div>
  );
}

function EndpointSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.06] p-5">
      <div className="flex gap-4">
        <Skeleton className="h-12 w-12 rounded-2xl bg-white/[0.05]" />

        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-48 bg-white/[0.05]" />
          <Skeleton className="h-3 w-32 bg-white/[0.05]" />
          <Skeleton className="h-10 w-full bg-white/[0.05]" />
        </div>
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex gap-3">
      <Skeleton className="h-9 w-9 rounded-xl bg-white/[0.05]" />

      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32 bg-white/[0.05]" />
        <Skeleton className="h-3 w-20 bg-white/[0.05]" />
      </div>
    </div>
  );
}

function EmptyState({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <div className="flex min-h-[500px] flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-emerald-500/10 bg-emerald-500/[0.04]">
        <div className="absolute inset-0 rounded-3xl bg-emerald-500/5 blur-xl" />

        <Server className="relative h-8 w-8 text-emerald-400" />
      </div>

      <h3 className="text-lg font-semibold text-white">
        No endpoints yet
      </h3>

      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
        Create your first MCP endpoint and connect
        GitHub, PostgreSQL, Supabase, or Vercel.
      </p>

      <Button
        onClick={onCreate}
        className="mt-6 rounded-xl bg-emerald-500 px-5 text-slate-950 shadow-lg shadow-emerald-500/10 hover:bg-emerald-400"
      >
        <Plus className="mr-2 h-4 w-4" />
        Create Endpoint
      </Button>
    </div>
  );
}