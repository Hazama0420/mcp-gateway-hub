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
  ExternalLink,
  Shield,
  Layers,
  Database,
  Globe2,
  Power,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { CreateEndpointModal } from '@/components/CreateEndpointModal';
import { ClientConfigModal } from '@/components/ui/client-config-modal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

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
}

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = React.useState<Endpoint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [configModalEndpoint, setConfigModalEndpoint] = React.useState<Endpoint | null>(null);
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
      console.error('Failed to copy: ', err);
    }
  };

  const handleToggleActive = async (endpoint: Endpoint) => {
    try {
      setTogglingId(endpoint.id);
      const newStatus = !endpoint.is_active;
      const res = await fetch('/api/endpoints', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: endpoint.id, is_active: newStatus }),
      });
      if (res.ok) {
        setEndpoints((prev) =>
          prev.map((e) => (e.id === endpoint.id ? { ...e, is_active: newStatus } : e))
        );
      }
    } catch (e) {
      console.error('Toggle error:', e);
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
        setEndpoints((prev) => prev.filter((e) => e.id !== deleteCandidate.id));
        setDeleteCandidate(null);
      }
    } catch (e) {
      console.error('Delete error:', e);
    } finally {
      setDeleting(false);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const filteredEndpoints = endpoints.filter((ep) => {
    const q = searchQuery.toLowerCase();
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
          <span className="pop-badge bg-slate-200 dark:bg-slate-800 text-slate-950 dark:text-slate-100 gap-1">
            <GithubIcon className="h-3 w-3" />
            GitHub
          </span>
        );
      case 'postgres':
      case 'postgresql':
      case 'supabase':
        return (
          <span className="pop-badge bg-sky-200 dark:bg-sky-900 text-sky-950 dark:text-sky-100 gap-1">
            <Database className="h-3 w-3 stroke-[2.5]" />
            Postgres
          </span>
        );
      case 'vercel':
        return (
          <span className="pop-badge bg-violet-200 dark:bg-violet-900 text-violet-950 dark:text-violet-100 gap-1">
            <Globe2 className="h-3 w-3 stroke-[2.5]" />
            Vercel
          </span>
        );
      default:
        return (
          <span className="pop-badge bg-amber-200 dark:bg-amber-900 text-amber-950 dark:text-amber-100 gap-1">
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
            <span className="pop-badge bg-sky-300 text-slate-950">
              ✦ GATEWAY NODES
            </span>
            <span className="pop-badge bg-[var(--color-pop-mint)] text-slate-950">
              {endpoints.length} Active Nodes
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tracking-tight font-mono mt-2">
            MCP Endpoints
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[var(--color-text-secondary)] mt-1">
            Create, configure, and expose secure Model Context Protocol gateway endpoints for AI clients.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs h-9 px-4 gap-1.5 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Create Endpoint</span>
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
            placeholder="Search endpoints by name, ID, or attached services..."
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
            <div key={i} className="h-48 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-5 animate-pulse shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]" />
          ))}
        </div>
      ) : filteredEndpoints.length === 0 ? (
        <EmptyState
          icon={Server}
          title={searchQuery ? 'No matching endpoints found' : 'No MCP endpoints configured'}
          description={
            searchQuery
              ? 'Try refining your search query or reset the filter.'
              : 'Create your first MCP endpoint to securely bridge Claude Desktop and Cursor to your backend tools.'
          }
          actionLabel={searchQuery ? undefined : 'Create Endpoint'}
          onAction={searchQuery ? undefined : () => setIsCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredEndpoints.map((ep) => {
            const httpUrl = `${origin}/api/mcp/${ep.id}/http`;

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
                        <p className="text-[10px] font-mono text-[var(--color-text-muted)] truncate max-w-xs mt-0.5 font-bold">
                          ID: {ep.id}
                        </p>
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
                        title={ep.is_active ? 'Pause endpoint' : 'Activate endpoint'}
                        aria-label={ep.is_active ? 'Pause endpoint' : 'Activate endpoint'}
                      >
                        <Power className="h-3.5 w-3.5 stroke-[3]" />
                      </Button>

                      {/* Delete Action */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteCandidate(ep)}
                        className="pop-btn h-8 px-2 text-rose-600 hover:bg-rose-100 border-2 border-[var(--color-border)]"
                        title="Delete endpoint"
                        aria-label="Delete endpoint"
                      >
                        <Trash2 className="h-3.5 w-3.5 stroke-[2.5]" />
                      </Button>
                    </div>
                  </div>

                  {/* Configured Services */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono font-bold text-[var(--color-text-muted)] uppercase">
                      Attached Services:
                    </span>
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

                  {/* MCP Authentication Status */}
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold bg-[var(--color-surface-elevated)] p-2 rounded-xl border border-[var(--color-border)]">
                    <span className="text-[var(--color-text-muted)] uppercase text-[10px]">MCP Auth:</span>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="text-emerald-600 dark:text-emerald-400">OAuth 2.1 ● Available</span>
                      <span className="text-sky-600 dark:text-sky-400">API Key ● Available</span>
                    </div>
                  </div>

                  {/* Streamable HTTP URL Copy Row */}
                  <div className="space-y-2 pt-2 border-t-2 border-black/5 dark:border-white/5">
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="pop-badge bg-amber-300 text-slate-950 px-1.5 py-0.2 text-[9px] font-mono font-black shrink-0">
                          HTTP
                        </span>
                        <span className="font-mono text-[var(--color-text-secondary)] truncate text-[11px] font-bold">{httpUrl}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(`http-${ep.id}`, httpUrl)}
                        className="h-6 px-2 text-[var(--color-text-primary)] font-bold shrink-0 text-[11px] gap-1 font-mono hover:bg-amber-300"
                        aria-label="Copy Streamable HTTP URL"
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
                  <div className="flex items-center justify-between pt-2 border-t-2 border-black/5 dark:border-white/5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfigModalEndpoint(ep)}
                      className="pop-btn h-8 px-3 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-amber-300 gap-1.5 font-bold"
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      Client Setup
                    </Button>

                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/playground?endpoint=${ep.id}`}
                        className="inline-flex items-center gap-1 text-xs font-black text-slate-950 dark:text-amber-300 bg-amber-300 dark:bg-amber-950/80 px-2.5 py-1 rounded-lg border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all font-mono"
                      >
                        <PlaySquare className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>Test in Playground →</span>
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
              Delete MCP Endpoint
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-[var(--color-text-secondary)]">
              Are you sure you want to permanently delete <strong className="text-[var(--color-text-primary)]">{deleteCandidate?.name}</strong>? Any connected Claude or Cursor clients will lose access.
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
              {deleting ? 'Deleting...' : 'Delete Endpoint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modals */}
      <CreateEndpointModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSuccess={fetchEndpoints}
      />
      <ClientConfigModal
        open={Boolean(configModalEndpoint)}
        onOpenChange={(open) => !open && setConfigModalEndpoint(null)}
        endpoint={configModalEndpoint}
      />
    </AppShell>
  );
}
