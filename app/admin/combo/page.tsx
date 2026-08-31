// app/admin/combo/page.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Layers,
  Plus,
  Search,
  Copy,
  Check,
  Code2,
  Trash2,
  PlaySquare,
  Activity,
  Globe2,
  GitBranch,
  Database,
  Server,
  Power,
  RotateCcw,
  Sparkles,
  Wrench,
  Key,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { CreateComboModal } from '@/components/combo/create-combo-modal';
import { EditComboModal } from '@/components/combo/edit-combo-modal';
import { ComboOAuthModal } from '@/components/combo/combo-oauth-modal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface ComboEndpointLink {
  id: string;
  endpoint_id: string;
  endpoint?: {
    id: string;
    name: string;
    is_active: boolean;
    services?: Array<{
      id: string;
      service_type: string;
    }>;
  };
}

interface Combo {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  endpoints: ComboEndpointLink[];
  tool_count?: number;
  adapters_count?: number;
}

export default function ComboPage() {
  const [combos, setCombos] = React.useState<Combo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editCombo, setEditCombo] = React.useState<Combo | null>(null);
  const [selectedOAuthCombo, setSelectedOAuthCombo] = React.useState<Combo | null>(null);
  const [deleteCandidate, setDeleteCandidate] = React.useState<Combo | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const fetchCombos = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/combo');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setCombos(data);
      }
    } catch (e) {
      console.error('Failed to fetch combos:', e);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchCombos();
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

  const handleToggleActive = async (combo: Combo) => {
    try {
      setTogglingId(combo.id);
      const res = await fetch('/api/combo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: combo.id, is_active: !combo.is_active }),
      });
      if (res.ok) {
        setCombos((prev) =>
          prev.map((item) => (item.id === combo.id ? { ...item, is_active: !item.is_active } : item))
        );
      }
    } catch (e) {
      console.error('Failed to toggle combo status:', e);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/combo?id=${deleteCandidate.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCombos((prev) => prev.filter((item) => item.id !== deleteCandidate.id));
        setDeleteCandidate(null);
      }
    } catch (e) {
      console.error('Failed to delete combo:', e);
    } finally {
      setDeleting(false);
    }
  };

  const origin =
    typeof window !== 'undefined'
      ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? window.location.origin
          : (process.env.NEXT_PUBLIC_APP_URL || 'https://mcp-gateway-hub-beta.vercel.app'))
      : 'https://mcp-gateway-hub-beta.vercel.app';

  const filteredCombos = combos.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.endpoints.some((link) => link.endpoint?.name.toLowerCase().includes(q))
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
            <span className="pop-badge bg-amber-400 text-slate-950 font-black font-mono">
              ✦ COMBO
            </span>
            <span className="pop-badge bg-[var(--color-pop-mint)] text-slate-950 font-black font-mono">
              {combos.length} Active Combos
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tracking-tight font-mono mt-2">
            Adapter Composition
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[var(--color-text-secondary)] mt-1">
            Gabungkan adapter yang sudah dikonfigurasi menjadi satu MCP connection.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs h-9 px-4 gap-1.5 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Create Combo</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCombos}
            className="pop-btn h-9 px-2.5 bg-[var(--color-surface)] text-[var(--color-text-primary)]"
            aria-label="Refresh Combos"
            title="Refresh Combos"
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
            placeholder="Search combos by name, description, or connected adapters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pop-input pl-10 h-10 text-xs font-medium"
          />
        </div>
      </div>

      {/* Combos Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-56 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-5 animate-pulse shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]" />
          ))}
        </div>
      ) : filteredCombos.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={searchQuery ? 'No matching combos found' : 'No Combos configured'}
          description={
            searchQuery
              ? 'Try refining your search query or reset the filter.'
              : 'Create your first Combo to combine Vercel, GitHub, and Neon adapters into one single MCP URL.'
          }
          actionLabel={searchQuery ? undefined : 'Create Combo'}
          onAction={searchQuery ? undefined : () => setIsCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredCombos.map((combo) => {
            const mcpUrl = `${origin}/api/mcp/combo/${combo.id}/http`;
            const adapterCount = combo.endpoints?.length || 0;
            const toolCount = combo.tool_count || (adapterCount * 4);

            return (
              <Card
                key={combo.id}
                className="pop-card pop-card-hover bg-[var(--color-surface)] text-[var(--color-text-primary)] border-2 border-[var(--color-border)] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]"
              >
                <CardContent className="p-5 space-y-4">
                  {/* Top Bar: Title, Status, Toggle, Delete */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                        <Layers className="h-5 w-5 stroke-[2.5]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-[var(--color-text-primary)] tracking-tight font-mono truncate uppercase">
                            ✦ {combo.name}
                          </h3>
                          <StatusBadge status={combo.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />
                        </div>
                        {combo.description ? (
                          <p className="text-xs text-[var(--color-text-secondary)] font-medium mt-0.5 line-clamp-1">
                            {combo.description}
                          </p>
                        ) : (
                          <p className="text-[10px] font-mono text-[var(--color-text-muted)] mt-0.5 font-bold">
                            ID: {combo.id}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Active/Inactive Toggle Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(combo)}
                        disabled={togglingId === combo.id}
                        className={`pop-btn h-8 px-2.5 text-xs ${
                          combo.is_active
                            ? 'bg-emerald-300 text-slate-950 hover:bg-emerald-200'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                        title={combo.is_active ? 'Disable combo' : 'Enable combo'}
                        aria-label={combo.is_active ? 'Disable combo' : 'Enable combo'}
                      >
                        <Power className="h-3.5 w-3.5 stroke-[3]" />
                      </Button>

                      {/* Delete Action */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteCandidate(combo)}
                        className="pop-btn h-8 px-2 text-rose-600 hover:bg-rose-100 border-2 border-[var(--color-border)]"
                        title="Delete combo"
                        aria-label="Delete combo"
                      >
                        <Trash2 className="h-3.5 w-3.5 stroke-[2.5]" />
                      </Button>
                    </div>
                  </div>

                  {/* Connected Adapters */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono font-bold text-[var(--color-text-muted)] uppercase">
                      <span>Connected Adapters ({adapterCount}):</span>
                      <button
                        onClick={() => setEditCombo(combo)}
                        className="text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1 text-[10px] lowercase font-mono font-black"
                      >
                        <Wrench className="h-3 w-3" />
                        edit adapters
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {combo.endpoints && combo.endpoints.length > 0 ? (
                        combo.endpoints.map((link, idx) => {
                          const epName = link.endpoint?.name || 'Adapter';
                          const primaryService = link.endpoint?.services?.[0]?.service_type || 'mcp';

                          return (
                            <span
                              key={idx}
                              className="pop-badge bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)] gap-1 text-[10px] font-mono font-bold py-1 px-2"
                            >
                              <Check className="h-3 w-3 text-emerald-600 stroke-[3]" />
                              <span>{epName}</span>
                              <span className="text-[var(--color-text-muted)] text-[9px]">
                                ({primaryService})
                              </span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)] italic">No adapters attached</span>
                      )}
                    </div>
                  </div>

                  {/* Stats Pill Row */}
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold bg-[var(--color-surface-elevated)] p-2.5 rounded-xl border border-[var(--color-border)]">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-text-muted)] uppercase text-[10px]">Composition:</span>
                      <span className="pop-badge bg-amber-200 dark:bg-amber-950 text-slate-900 dark:text-amber-300 text-[10px] font-mono font-black px-2 py-0.5">
                        {adapterCount} {adapterCount === 1 ? 'Adapter' : 'Adapters'} • {toolCount} Tools
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-black">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Single MCP URL</span>
                    </div>
                  </div>

                  {/* Single MCP URL Copy Row */}
                  <div className="space-y-2 pt-2 border-t-2 border-black/5 dark:border-white/5">
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="pop-badge bg-amber-300 text-slate-950 px-1.5 py-0.2 text-[9px] font-mono font-black shrink-0">
                          COMBO URL
                        </span>
                        <span className="font-mono text-[var(--color-text-secondary)] truncate text-[11px] font-bold">
                          {mcpUrl}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(`combo-${combo.id}`, mcpUrl)}
                        className="h-6 px-2 text-[var(--color-text-primary)] font-bold shrink-0 text-[11px] gap-1 font-mono hover:bg-amber-300"
                        aria-label="Copy Combo MCP URL"
                      >
                        {copiedId === `combo-${combo.id}` ? (
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
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditCombo(combo)}
                        className="pop-btn h-8 px-2.5 text-xs bg-amber-300/40 dark:bg-amber-950/50 text-[var(--color-text-primary)] hover:bg-amber-300 gap-1 font-bold"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedOAuthCombo(combo)}
                        className="pop-btn h-8 px-2.5 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-amber-300 gap-1 font-bold"
                      >
                        <Key className="h-3.5 w-3.5 text-amber-500" />
                        <span>Setup / OAuth</span>
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/playground?combo=${combo.id}`}
                        className="inline-flex items-center gap-1 text-xs font-black text-slate-950 dark:text-amber-300 bg-amber-300 dark:bg-amber-950/80 px-2.5 py-1 rounded-lg border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all font-mono"
                      >
                        <PlaySquare className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>Playground →</span>
                      </Link>
                      <Link
                        href={`/admin/logs?endpoint_id=${combo.id}`}
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
        <DialogContent className="sm:max-w-[460px] bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-rose-600 font-mono">
              Delete &quot;{deleteCandidate?.name}&quot;?
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-[var(--color-text-secondary)] mt-1">
              This permanently removes the Combo and its adapter links. <strong className="text-[var(--color-text-primary)]">Existing adapters and credentials will not be deleted.</strong>
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
              {deleting ? 'Deleting...' : 'Delete permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create & Edit Modals */}
      <CreateComboModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSuccess={fetchCombos}
      />
      <EditComboModal
        open={Boolean(editCombo)}
        onOpenChange={(open) => !open && setEditCombo(null)}
        combo={editCombo}
        onSuccess={fetchCombos}
      />
      <ComboOAuthModal
        open={Boolean(selectedOAuthCombo)}
        onOpenChange={(open) => !open && setSelectedOAuthCombo(null)}
        combo={selectedOAuthCombo}
      />
    </AppShell>
  );
}

