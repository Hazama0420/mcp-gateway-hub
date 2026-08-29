// app/admin/endpoints/page.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Server,
  Plus,
  Search,
  Copy,
  Check,
  Code2,
  Trash2,
  PlaySquare,
  Activity,
  Shield,
  Layers,
  Database,
  Globe2,
  Power,
  RotateCcw,
  Sparkles,
  Lock,
  GitBranch,
  Wrench,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { CreateEndpointModal } from '@/components/CreateEndpointModal';
import { ClientConfigModal } from '@/components/ui/client-config-modal';
import { EndpointOAuthModal } from '@/components/ui/endpoint-oauth-modal';
import { EditServicesModal } from '@/components/endpoints/edit-services-modal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface EndpointService {
  id?: string;
  service_type: string;
}

interface Endpoint {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  services: EndpointService[];
  tool_count?: number;
}

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = React.useState<Endpoint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [configModalEndpoint, setConfigModalEndpoint] = React.useState<Endpoint | null>(null);
  const [oauthModalEndpoint, setOauthModalEndpoint] = React.useState<Endpoint | null>(null);
  const [editServicesEndpoint, setEditServicesEndpoint] = React.useState<Endpoint | null>(null);
  const [deleteCandidate, setDeleteCandidate] = React.useState<Endpoint | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const fetchEndpoints = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/endpoints');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setEndpoints(data);
      }
    } catch (e) {
      console.error('Failed to fetch endpoints:', e);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchEndpoints();
  }, []);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleToggleActive = async (ep: Endpoint) => {
    try {
      setTogglingId(ep.id);
      const res = await fetch('/api/endpoints', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ep.id, is_active: !ep.is_active }),
      });
      if (res.ok) {
        setEndpoints((prev) =>
          prev.map((item) => (item.id === ep.id ? { ...item, is_active: !item.is_active } : item))
        );
      }
    } catch (e) {
      console.error('Failed to toggle endpoint status:', e);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/endpoints?id=${deleteCandidate.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setEndpoints((prev) => prev.filter((item) => item.id !== deleteCandidate.id));
        setDeleteCandidate(null);
      }
    } catch (e) {
      console.error('Failed to delete endpoint:', e);
    } finally {
      setDeleting(false);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const filteredEndpoints = endpoints.filter((ep) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      ep.name.toLowerCase().includes(q) ||
      ep.id.toLowerCase().includes(q) ||
      ep.services?.some((s) => s.service_type.toLowerCase().includes(q))
    );
  });

  const getServiceBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case 'github':
        return (
          <span className="pop-badge bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-200 border border-[var(--color-border)] gap-1 text-[10px] font-mono font-bold">
            <GitBranch className="h-3 w-3 stroke-[2.5]" />
            GitHub
          </span>
        );
      case 'postgres':
      case 'postgresql':
        return (
          <span className="pop-badge bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-[var(--color-border)] gap-1 text-[10px] font-mono font-bold">
            <Database className="h-3 w-3 stroke-[2.5]" />
            PostgreSQL
          </span>
        );
      case 'supabase':
        return (
          <span className="pop-badge bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 border border-[var(--color-border)] gap-1 text-[10px] font-mono font-bold">
            <Database className="h-3 w-3 stroke-[2.5]" />
            Supabase
          </span>
        );
      case 'vercel':
        return (
          <span className="pop-badge bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-200 border border-[var(--color-border)] gap-1 text-[10px] font-mono font-bold">
            <Globe2 className="h-3 w-3 stroke-[2.5]" />
            Vercel
          </span>
        );
      default:
        return (
          <span className="pop-badge bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-[var(--color-border)] gap-1 text-[10px] font-mono font-bold">
            <Server className="h-3 w-3 stroke-[2.5]" />
            {type}
          </span>
        );
    }
  };

  return (
    <AppShell>
      {/* Header Banner & Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="pop-badge bg-sky-300 text-slate-950 font-black font-mono">
              ✦ GATEWAY CONNECTIONS
            </span>
            <span className="pop-badge bg-[var(--color-pop-mint)] text-slate-950 font-black font-mono">
              {endpoints.length} Active Bundles
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tracking-tight font-mono mt-2">
            MCP Connections
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[var(--color-text-secondary)] mt-1">
            Bundle Vercel, GitHub, and PostgreSQL/Neon services into single, multi-service MCP URLs for Gemini Spark & Claude.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs h-9 px-4 gap-1.5 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Create Connection</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchEndpoints}
            className="pop-btn h-9 px-2.5 bg-[var(--color-surface)] text-[var(--color-text-primary)]"
            aria-label="Refresh Endpoints"
            title="Refresh Endpoints"
          >
            <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
          <Input
            placeholder="Search connections by name, ID, or attached services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pop-input pl-10 h-10 text-xs font-medium"
          />
        </div>
      </div>

      {/* Endpoints Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-5 animate-pulse shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]" />
          ))}
        </div>
      ) : filteredEndpoints.length === 0 ? (
        <EmptyState
          icon={Server}
          title={searchQuery ? 'No matching connections found' : 'No MCP connections configured'}
          description={
            searchQuery
              ? 'Try refining your search query or reset the filter.'
              : 'Create your first MCP connection bundle to combine Vercel, GitHub, and Neon into one MCP URL.'
          }
          actionLabel={searchQuery ? undefined : 'Create Connection'}
          onAction={searchQuery ? undefined : () => setIsCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredEndpoints.map((ep) => {
            const httpUrl = `${origin}/api/mcp/${ep.id}/http`;
            const serviceCount = ep.services?.length || 0;
            const toolCount = ep.tool_count || (serviceCount * 3);

            return (
              <Card
                key={ep.id}
                className="pop-card pop-card-hover bg-[var(--color-surface)] text-[var(--color-text-primary)] border-2 border-[var(--color-border)] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]"
              >
                <CardContent className="p-5 space-y-4">
                  {/* Top Bar: Title, Status, and Toggle */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-300 dark:bg-sky-500 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                        <Server className="h-5 w-5 stroke-[2.5]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-[var(--color-text-primary)] tracking-tight font-mono truncate">
                            {ep.name}
                          </h3>
                          <StatusBadge status={ep.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-[var(--color-text-muted)] font-bold truncate max-w-[140px]">
                            ID: {ep.id}
                          </span>
                          <span className="pop-badge bg-amber-200 dark:bg-amber-950 text-slate-900 dark:text-amber-300 text-[9px] font-mono font-black px-1.5 py-0">
                            {serviceCount} {serviceCount === 1 ? 'Service' : 'Services'} • {toolCount} Tools
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Active/Inactive Toggle Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(ep)}
                        disabled={togglingId === ep.id}
                        className={`pop-btn h-8 px-2.5 text-xs ${
                          ep.is_active
                            ? 'bg-emerald-300 text-slate-950 hover:bg-emerald-200'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                        title={ep.is_active ? 'Disable connection' : 'Enable connection'}
                        aria-label={ep.is_active ? 'Disable connection' : 'Enable connection'}
                      >
                        <Power className="h-3.5 w-3.5 stroke-[3]" />
                      </Button>

                      {/* Delete Action */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteCandidate(ep)}
                        className="pop-btn h-8 px-2 text-rose-600 hover:bg-rose-100 border-2 border-[var(--color-border)]"
                        title="Delete connection"
                        aria-label="Delete connection"
                      >
                        <Trash2 className="h-3.5 w-3.5 stroke-[2.5]" />
                      </Button>
                    </div>
                  </div>

                  {/* Configured Services & Edit Button */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono font-bold text-[var(--color-text-muted)] uppercase">
                      <span>Attached Services in Bundle:</span>
                      <button
                        onClick={() => setEditServicesEndpoint(ep)}
                        className="text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1 text-[10px] lowercase font-mono font-black"
                      >
                        <Wrench className="h-3 w-3" />
                        edit services
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ep.services && ep.services.length > 0 ? (
                        ep.services.map((s, idx) => (
                          <React.Fragment key={idx}>{getServiceBadge(s.service_type)}</React.Fragment>
                        ))
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)] italic">No services attached</span>
                      )}
                    </div>
                  </div>

                  {/* MCP Authentication Status & OAuth Button */}
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold bg-[var(--color-surface-elevated)] p-2.5 rounded-xl border border-[var(--color-border)]">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-text-muted)] uppercase text-[10px]">Auth:</span>
                      <span className="text-emerald-600 dark:text-emerald-400">OAuth 2.1 ● Active</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOauthModalEndpoint(ep)}
                      className="pop-btn h-7 px-2 text-[10px] bg-amber-400 text-slate-950 hover:bg-amber-300 font-black gap-1"
                    >
                      <Lock className="h-3 w-3 stroke-[2.5]" />
                      <span>Manage OAuth</span>
                    </Button>
                  </div>

                  {/* Streamable HTTP URL Copy Row */}
                  <div className="space-y-2 pt-2 border-t-2 border-black/5 dark:border-white/5">
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="pop-badge bg-amber-300 text-slate-950 px-1.5 py-0.2 text-[9px] font-mono font-black shrink-0">
                          MCP URL
                        </span>
                        <span className="font-mono text-[var(--color-text-secondary)] truncate text-[11px] font-bold">{httpUrl}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(`http-${ep.id}`, httpUrl)}
                        className="h-6 px-2 text-[var(--color-text-primary)] font-bold shrink-0 text-[11px] gap-1 font-mono hover:bg-amber-300"
                        aria-label="Copy MCP URL"
                      >
                        {copiedId === `http-${ep.id}` ? (
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
                  </div>

                  {/* Actions Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t-2 border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditServicesEndpoint(ep)}
                        className="pop-btn h-8 px-2.5 text-xs bg-amber-300/40 dark:bg-amber-950/50 text-[var(--color-text-primary)] hover:bg-amber-300 gap-1 font-bold"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Edit Bundle
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfigModalEndpoint(ep)}
                        className="pop-btn h-8 px-2.5 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-amber-300 gap-1 font-bold"
                      >
                        <Code2 className="h-3.5 w-3.5" />
                        Setup
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/playground?endpoint=${ep.id}`}
                        className="inline-flex items-center gap-1 text-xs font-black text-slate-950 dark:text-amber-300 bg-amber-300 dark:bg-amber-950/80 px-2.5 py-1 rounded-lg border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all font-mono"
                      >
                        <PlaySquare className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>Playground →</span>
                      </Link>
                      <Link
                        href={`/admin/logs?endpoint_id=${ep.id}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:underline font-mono"
                      >
                        <Activity className="h-3.5 w-3.5" />
                        Logs
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteCandidate)} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <DialogContent className="sm:max-w-[440px] bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-rose-600 font-mono">
              Delete MCP Connection
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-[var(--color-text-secondary)]">
              Are you sure you want to permanently delete <strong className="text-[var(--color-text-primary)]">{deleteCandidate?.name}</strong>? Any connected Gemini Spark or Cursor clients will lose access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteCandidate(null)}
              className="pop-btn text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="pop-btn bg-rose-500 text-white hover:bg-rose-600 text-xs font-black"
            >
              {deleting ? 'Deleting...' : 'Delete Connection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modals */}
      <CreateEndpointModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSuccess={fetchEndpoints}
        onOpenPlayground={(id) => {
          window.location.href = `/admin/playground?endpoint=${id}`;
        }}
        onOpenClientConfig={(ep) => setConfigModalEndpoint(ep)}
        onOpenOAuthModal={(ep) => setOauthModalEndpoint(ep)}
      />
      <ClientConfigModal
        open={Boolean(configModalEndpoint)}
        onOpenChange={(open) => !open && setConfigModalEndpoint(null)}
        endpoint={configModalEndpoint}
      />
      <EndpointOAuthModal
        open={Boolean(oauthModalEndpoint)}
        onOpenChange={(open) => !open && setOauthModalEndpoint(null)}
        endpoint={oauthModalEndpoint}
      />
      <EditServicesModal
        open={Boolean(editServicesEndpoint)}
        onOpenChange={(open) => !open && setEditServicesEndpoint(null)}
        endpoint={editServicesEndpoint}
        onSuccess={fetchEndpoints}
      />
    </AppShell>
  );
}

