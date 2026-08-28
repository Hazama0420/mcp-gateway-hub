// app/admin/logs/page.tsx
'use client';

import * as React from 'react';
import {
  Activity,
  Search,
  Filter,
  RefreshCw,
  Server,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Copy,
  Check,
  Eye,
  Layers,
  Terminal,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CodeBlock } from '@/components/ui/code-block';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ExecutionLog {
  id: string;
  execution_id: string;
  tool_name: string;
  source: string;
  status: string;
  error_category: string | null;
  execution_time_ms: number;
  result_size: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
  endpoint?: { id: string; name: string };
  user?: { id: string; email: string };
}

export default function ExecutionLogsPage() {
  const [logs, setLogs] = React.useState<ExecutionLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = React.useState<string>('ALL');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [autoRefresh, setAutoRefresh] = React.useState<boolean>(false);

  const [selectedLog, setSelectedLog] = React.useState<ExecutionLog | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const fetchLogs = async (silent = false) => {
    try {
      if (!silent) setRefreshing(true);
      const res = await fetch('/api/endpoints/logs?limit=100');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  React.useEffect(() => {
    fetchLogs();
  }, []);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (statusFilter !== 'ALL' && log.status !== statusFilter) return false;
    if (sourceFilter !== 'ALL' && log.source !== sourceFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTool = log.tool_name?.toLowerCase().includes(q);
      const matchExecId = log.execution_id?.toLowerCase().includes(q);
      const matchEp = log.endpoint?.name?.toLowerCase().includes(q);
      return matchTool || matchExecId || matchEp;
    }
    return true;
  });

  return (
    <AppShell>
      {/* Header Banner & Live Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="pop-badge bg-amber-300 text-slate-950">
              ✦ OBSERVABILITY LOGS
            </span>
            <span className="pop-badge bg-[var(--color-pop-mint)] text-slate-950">
              {logs.length} Audit Events
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tracking-tight font-mono mt-2">
            Execution Observability Console
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[var(--color-text-secondary)] mt-1">
            Realtime audit log trail of MCP tool calls, latency telemetry, error categorization, and security events.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Auto Refresh Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`pop-btn h-9 px-3 text-xs gap-2 font-mono ${
              autoRefresh
                ? 'bg-emerald-300 text-slate-950 font-black'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] font-bold'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-emerald-600 animate-ping' : 'bg-slate-400'}`} />
            {autoRefresh ? 'Live Stream Active' : 'Live Stream Off'}
          </Button>

          {/* Manual Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLogs()}
            className="pop-btn h-9 px-2.5 bg-[var(--color-surface)] text-[var(--color-text-primary)]"
            aria-label="Refresh Logs"
            title="Refresh Logs"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
          <Input
            placeholder="Search by tool name, execution ID (EX-...), or endpoint..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pop-input pl-10 h-10 text-xs font-medium"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pop-input h-10 px-3 text-xs font-bold font-mono"
          >
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="RATE_LIMITED">Rate Limited</option>
            <option value="BLOCKED">Blocked</option>
          </select>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="pop-input h-10 px-3 text-xs font-bold font-mono"
          >
            <option value="ALL">All Sources</option>
            <option value="MCP">MCP Client</option>
            <option value="PLAYGROUND">Playground</option>
            <option value="GATEWAY">Gateway</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4 animate-pulse shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]" />
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={searchQuery || statusFilter !== 'ALL' ? 'No matching logs' : 'No execution logs recorded yet'}
          description={
            searchQuery || statusFilter !== 'ALL'
              ? 'Try changing or clearing your search filters.'
              : 'Every MCP tool call from Claude, Cursor, or Playground is recorded here with non-blocking audit logging.'
          }
        />
      ) : (
        <div className="pop-card overflow-hidden bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] uppercase tracking-wider font-mono text-[10px] font-black">
                <tr>
                  <th className="px-4 py-3.5">Execution ID</th>
                  <th className="px-4 py-3.5">Tool & Endpoint</th>
                  <th className="px-4 py-3.5">Source</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Latency</th>
                  <th className="px-4 py-3.5">Timestamp</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-[var(--color-border)] font-mono text-[11px] font-bold">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id || log.execution_id}
                    className="hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--color-text-primary)]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[130px] font-black">{log.execution_id}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(log.id, log.execution_id)}
                          className="h-5 w-5 p-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                          aria-label="Copy execution ID"
                        >
                          {copiedId === log.id ? (
                            <Check className="h-3 w-3 text-emerald-600 stroke-[3]" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-black text-[var(--color-text-primary)] text-xs">
                        {log.tool_name}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-muted)] truncate max-w-xs font-medium">
                        {log.endpoint?.name || 'Direct / Integration'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="pop-badge bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] text-[9px]">
                        {log.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={log.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {log.execution_time_ms}ms
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] font-medium">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                        className="pop-btn h-7 px-2.5 text-xs bg-[var(--color-pop-yellow)] text-slate-950 font-black gap-1 font-mono"
                      >
                        <Eye className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>Inspect</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Inspector Dialog */}
      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-[620px] bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)]">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                <Terminal className="h-4 w-4 stroke-[2.5]" />
              </div>
              <div>
                <DialogTitle className="text-base font-black text-[var(--color-text-primary)] font-mono">
                  {selectedLog?.execution_id}
                </DialogTitle>
                <DialogDescription className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Execution diagnostic trace & sanitized metadata
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 pt-2 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3 bg-[var(--color-surface-elevated)] p-3.5 rounded-2xl border-2 border-[var(--color-border)] font-bold shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                <div>
                  <span className="text-[10px] text-[var(--color-text-muted)] block uppercase">Tool Name</span>
                  <span className="font-black text-[var(--color-text-primary)] text-sm">{selectedLog.tool_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--color-text-muted)] block uppercase">Status</span>
                  <StatusBadge status={selectedLog.status} size="sm" />
                </div>
                <div>
                  <span className="text-[10px] text-[var(--color-text-muted)] block uppercase">Latency</span>
                  <span className="text-[var(--color-text-primary)]">{selectedLog.execution_time_ms} ms</span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--color-text-muted)] block uppercase">Source</span>
                  <span className="text-[var(--color-text-primary)]">{selectedLog.source}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--color-text-muted)] block uppercase">Endpoint</span>
                  <span className="text-[var(--color-text-primary)] truncate block">{selectedLog.endpoint?.name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--color-text-muted)] block uppercase">Timestamp</span>
                  <span className="text-[var(--color-text-muted)]">{new Date(selectedLog.created_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Sanitized Metadata */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-black text-[var(--color-text-primary)]">Sanitized Audit Metadata:</span>
                <CodeBlock
                  code={JSON.stringify(selectedLog.metadata || {}, null, 2)}
                  language="json"
                  title="Audit Metadata (Credentials Excluded)"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}