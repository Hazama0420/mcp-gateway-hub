// components/combo/combo-oauth-modal.tsx
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Lock,
  Sparkles,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  ExternalLink,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  HelpCircle,
  Zap,
  Globe2,
} from 'lucide-react';

interface ComboOAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  combo: {
    id: string;
    name: string;
  } | null;
}

interface OAuthClientRecord {
  id: string;
  client_id: string;
  client_name: string;
  client_type: string;
  token_endpoint_auth_method: string;
  redirect_uris: string[];
  scope: string;
  is_active: boolean;
  created_at: string;
}

export function ComboOAuthModal({
  open,
  onOpenChange,
  combo,
}: ComboOAuthModalProps) {
  const [activeTab, setActiveTab] = React.useState<'gemini' | 'clients' | 'diagnostics'>('gemini');

  // Client list & loading
  const [clients, setClients] = React.useState<OAuthClientRecord[]>([]);
  const [loadingClients, setLoadingClients] = React.useState(false);

  // Create Client dialog states
  const [isCreatingClient, setIsCreatingClient] = React.useState(false);
  const [newClientName, setNewClientName] = React.useState('Gemini Spark');
  const [newClientType, setNewClientType] = React.useState<'confidential' | 'public'>('public');
  const [newScope, setNewScope] = React.useState('mcp:read mcp:write');
  const [creatingSubmitting, setCreatingSubmitting] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const canonicalRedirectUri = 'https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-102731520205207880268-mcp-gateway-hub-beta_vercel_app';

  // Post-Creation One-Time Secret Display
  const [createdClientResult, setCreatedClientResult] = React.useState<{
    client_id: string;
    client_secret?: string;
    client_name: string;
  } | null>(null);
  const [secretRevealed, setSecretRevealed] = React.useState(false);

  // Revoke confirmation dialog & state
  const [revokeTarget, setRevokeTarget] = React.useState<OAuthClientRecord | null>(null);
  const [revoking, setRevoking] = React.useState(false);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = React.useState<string | null>(null);

  // Delete confirmation dialog & state
  const [deleteTarget, setDeleteTarget] = React.useState<OAuthClientRecord | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = React.useState<string | null>(null);

  // Diagnostics test
  const [testResult, setTestResult] = React.useState<any | null>(null);
  const [testingDiagnostics, setTestingDiagnostics] = React.useState(false);

  // Copy state helpers
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const origin =
    typeof window !== 'undefined'
      ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? window.location.origin
          : (process.env.NEXT_PUBLIC_APP_URL || 'https://mcp-gateway-hub-beta.vercel.app'))
      : 'https://mcp-gateway-hub-beta.vercel.app';
  const mcpServerUrl = combo ? `${origin}/api/mcp/combo/${combo.id}/http` : '';
  const authorizationUrl = `${origin}/oauth/authorize`;
  const tokenUrl = `${origin}/oauth/token`;

  const fetchClients = React.useCallback(async () => {
    if (!combo?.id) return;
    try {
      setLoadingClients(true);
      const res = await fetch(`/api/combo/${combo.id}/oauth-clients`);
      if (res.ok) {
        const data = await res.json();
        setClients(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch combo oauth clients:', e);
    } finally {
      setLoadingClients(false);
    }
  }, [combo?.id]);

  React.useEffect(() => {
    if (open && combo?.id) {
      fetchClients();
      setActiveTab('gemini');
      setTestResult(null);
      setRevokeSuccess(null);
      setDeleteSuccess(null);
    }
  }, [open, combo?.id, fetchClients]);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!combo?.id) return;
    setCreatingSubmitting(true);
    setCreateError(null);

    try {
      const res = await fetch(`/api/combo/${combo.id}/oauth-clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: newClientName,
          client_type: newClientType,
          scope: newScope,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to create OAuth client');
      }

      setCreatedClientResult(data);
      setIsCreatingClient(false);
      fetchClients();
    } catch (err: any) {
      setCreateError(err.message || 'Error creating OAuth client');
    } finally {
      setCreatingSubmitting(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!combo?.id || !revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);
    setRevokeSuccess(null);

    try {
      const res = await fetch(`/api/combo/${combo.id}/oauth-clients/${revokeTarget.client_id}`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to revoke OAuth client');
      }
      setRevokeSuccess(`Client "${revokeTarget.client_name}" successfully revoked.`);
      setRevokeTarget(null);
      fetchClients();
    } catch (err: any) {
      setRevokeError(err.message || 'Failed to revoke client');
    } finally {
      setRevoking(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!combo?.id || !deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      const res = await fetch(`/api/combo/${combo.id}/oauth-clients/${deleteTarget.client_id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to delete OAuth client');
      }
      setDeleteSuccess(`Client "${deleteTarget.client_name}" permanently deleted.`);
      setDeleteTarget(null);
      fetchClients();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete client');
    } finally {
      setDeleting(false);
    }
  };

  const primaryClient = clients.find((c) => c.is_active) || clients[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[92vh] overflow-y-auto bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)] p-0 gap-0">
        {/* Header */}
        <div className="p-6 pb-4 border-b-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <Key className="h-6 w-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-black">
                <Sparkles className="h-3.5 w-3.5 text-amber-500 stroke-[2.5]" />
                <span>COMBO OAUTH 2.1 SETUP</span>
              </div>
              <DialogTitle className="text-lg sm:text-xl font-black font-mono tracking-tight text-[var(--color-text-primary)]">
                OAuth &amp; Gemini Spark: {combo?.name}
              </DialogTitle>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] font-medium">
            Manage AI clients authorized to connect to this unified Combo via OAuth 2.1 with PKCE S256.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)]/40 px-6 gap-2">
          <button
            onClick={() => setActiveTab('gemini')}
            className={`py-3 px-4 text-xs font-mono font-black border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'gemini'
                ? 'border-amber-400 text-[var(--color-text-primary)] bg-[var(--color-surface)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500 stroke-[2.5]" />
            <span>Gemini Spark Setup</span>
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            className={`py-3 px-4 text-xs font-mono font-black border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'clients'
                ? 'border-amber-400 text-[var(--color-text-primary)] bg-[var(--color-surface)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Lock className="h-3.5 w-3.5 text-sky-500 stroke-[2.5]" />
            <span>OAuth Clients ({clients.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Notifications */}
          {revokeSuccess && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500 text-emerald-800 dark:text-emerald-200 text-xs px-4 py-2.5 rounded-xl font-bold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{revokeSuccess}</span>
            </div>
          )}
          {deleteSuccess && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500 text-emerald-800 dark:text-emerald-200 text-xs px-4 py-2.5 rounded-xl font-bold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{deleteSuccess}</span>
            </div>
          )}

          {/* TAB 1: Gemini Spark Setup */}
          {activeTab === 'gemini' && (
            <div className="space-y-5">
              {/* Copyable Fields Box */}
              <div className="space-y-3.5">
                {/* 1. MCP Server URL */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-mono font-black uppercase text-[var(--color-text-primary)]">
                      1. Combo MCP Server URL
                    </Label>
                    <span className="pop-badge bg-amber-300 text-slate-950 font-mono text-[9px] font-black px-1.5 py-0">
                      PASTE INTO GEMINI
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={mcpServerUrl}
                      className="pop-input font-mono text-xs font-bold text-[var(--color-text-primary)] bg-[var(--color-surface-elevated)]"
                    />
                    <Button
                      onClick={() => handleCopy(mcpServerUrl, 'mcp_url')}
                      className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-mono font-bold text-xs h-10 px-3 shrink-0 gap-1.5"
                    >
                      {copiedKey === 'mcp_url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedKey === 'mcp_url' ? 'Copied' : 'Copy'}</span>
                    </Button>
                  </div>
                </div>

                {/* 2. Client ID */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-mono font-black uppercase text-[var(--color-text-primary)]">
                      2. OAuth Client ID
                    </Label>
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)] font-bold">
                      {primaryClient ? `Client: ${primaryClient.client_name}` : 'No active client'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={primaryClient ? primaryClient.client_id : 'No client registered yet'}
                      className="pop-input font-mono text-xs font-bold text-[var(--color-text-primary)] bg-[var(--color-surface-elevated)]"
                    />
                    {primaryClient && (
                      <Button
                        onClick={() => handleCopy(primaryClient.client_id, 'client_id')}
                        className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-mono font-bold text-xs h-10 px-3 shrink-0 gap-1.5"
                      >
                        {copiedKey === 'client_id' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedKey === 'client_id' ? 'Copied' : 'Copy'}</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* 3. Managed Redirect URI Box */}
                <div className="p-3.5 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-black uppercase text-[var(--color-text-primary)]">
                      Redirect URI
                    </span>
                    <span className="pop-badge bg-emerald-300 text-slate-950 font-mono text-[9px] font-black px-2 py-0.5">
                      AUTOMATICALLY MANAGED
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] font-mono text-[11px] text-[var(--color-text-secondary)] font-bold break-all">
                    {canonicalRedirectUri}
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] font-medium">
                    This redirect URI is managed automatically by MCP Gateway Hub and pre-registered for Gemini Spark.
                  </p>
                </div>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border-2 border-amber-400 space-y-2 text-xs text-[var(--color-text-secondary)]">
                <div className="font-mono font-black text-[var(--color-text-primary)] flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500 stroke-[2.5]" />
                  <span>Connecting Gemini Spark to this Combo:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 font-medium">
                  <li>Open <strong>Gemini Spark</strong> and navigate to <strong>Custom Apps / MCP</strong>.</li>
                  <li>Click <strong>Add Tool</strong> and select <strong>Model Context Protocol (HTTP)</strong>.</li>
                  <li>Paste the <strong>Combo MCP Server URL</strong> and select <strong>OAuth 2.1 (PKCE)</strong>.</li>
                  <li>Enter the <strong>Client ID</strong> above and authorize the request when prompted.</li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 2: OAuth Clients List */}
          {activeTab === 'clients' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-mono font-black text-xs uppercase text-[var(--color-text-primary)]">
                    Authorized OAuth Clients
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Manage AI clients authorized to access this Combo.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setNewClientName('Gemini Spark');
                    setNewClientType('public');
                    setCreateError(null);
                    setIsCreatingClient(true);
                  }}
                  className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-mono font-black text-xs gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                >
                  <Plus className="h-4 w-4 stroke-[3]" />
                  <span>Create OAuth Client</span>
                </Button>
              </div>

              {loadingClients ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-24 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] animate-pulse" />
                  ))}
                </div>
              ) : clients.length === 0 ? (
                <div className="p-8 text-center rounded-xl border-2 border-dashed border-[var(--color-border)] space-y-3">
                  <Lock className="h-8 w-8 text-[var(--color-text-muted)] mx-auto opacity-50" />
                  <p className="text-xs font-bold text-[var(--color-text-secondary)]">
                    No OAuth clients configured for this Combo.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setIsCreatingClient(true)}
                    className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-mono font-black text-xs"
                  >
                    + Create First Client
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {clients.map((client) => (
                    <div
                      key={client.id}
                      className="p-4 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] space-y-3 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-mono font-black text-xs text-[var(--color-text-primary)]">
                              {client.client_name}
                            </h4>
                            <span
                              className={`pop-badge font-mono text-[9px] font-black px-1.5 py-0 ${
                                client.is_active
                                  ? 'bg-emerald-300 text-slate-950'
                                  : 'bg-rose-200 dark:bg-rose-950 text-rose-800 dark:text-rose-200'
                              }`}
                            >
                              {client.is_active ? '● ACTIVE' : '● REVOKED'}
                            </span>
                            <span className="pop-badge bg-sky-200 dark:bg-sky-950 text-sky-800 dark:text-sky-200 font-mono text-[9px] font-black px-1.5 py-0">
                              {client.client_type === 'public' ? 'Public • PKCE S256' : 'Confidential (Secret)'}
                            </span>
                          </div>
                          <p className="font-mono text-[10px] text-[var(--color-text-muted)] mt-1 truncate max-w-md">
                            Client ID: {client.client_id}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {client.is_active ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRevokeTarget(client)}
                              className="pop-btn h-8 px-2.5 text-xs text-rose-600 border-2 border-[var(--color-border)] hover:bg-rose-100 dark:hover:bg-rose-950"
                            >
                              Revoke
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteTarget(client)}
                              className="pop-btn h-8 px-2.5 text-xs text-rose-600 border-2 border-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950 gap-1"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Delete</span>
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)]">
                        <span>Permissions: <strong className="text-[var(--color-text-secondary)]">{client.scope}</strong></span>
                        <span>Created: {new Date(client.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Create Client Modal */}
        <Dialog open={isCreatingClient} onOpenChange={setIsCreatingClient}>
          <DialogContent className="sm:max-w-[480px] bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)]">
            <DialogHeader>
              <DialogTitle className="text-base font-black font-mono">
                Create OAuth Client for Combo
              </DialogTitle>
              <DialogDescription className="text-xs font-medium text-[var(--color-text-secondary)]">
                Register a new client identity for AI tools connecting to this Combo.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateClient} className="space-y-4 pt-2">
              {createError && (
                <div className="bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-500 text-rose-700 dark:text-rose-200 text-xs px-3.5 py-2 rounded-xl font-bold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-mono font-black uppercase text-[var(--color-text-primary)]">
                  Client Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="e.g. Gemini Spark"
                  className="pop-input h-10 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono font-black uppercase text-[var(--color-text-primary)]">
                  Client Type <span className="text-rose-500">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewClientType('public')}
                    className={`p-3 rounded-xl border-2 text-left font-mono transition-all ${
                      newClientType === 'public'
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] opacity-70'
                    }`}
                  >
                    <div className="text-xs font-black">● Public (PKCE S256)</div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      Gemini Spark recommended
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewClientType('confidential')}
                    className={`p-3 rounded-xl border-2 text-left font-mono transition-all ${
                      newClientType === 'confidential'
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] opacity-70'
                    }`}
                  >
                    <div className="text-xs font-black">○ Confidential</div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      Client Secret required
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border)] space-y-1 text-xs font-mono">
                <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase">
                  Managed Redirect URI:
                </div>
                <div className="text-[11px] font-bold text-[var(--color-text-secondary)] break-all">
                  {canonicalRedirectUri}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreatingClient(false)}
                  className="pop-btn text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creatingSubmitting || !newClientName.trim()}
                  className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-mono font-black text-xs"
                >
                  {creatingSubmitting ? 'Creating...' : 'Create Client'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Post-Creation One-Time Secret Dialog */}
        <Dialog open={Boolean(createdClientResult)} onOpenChange={(open) => !open && setCreatedClientResult(null)}>
          <DialogContent className="sm:max-w-[480px] bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)]">
            <DialogHeader>
              <DialogTitle className="text-base font-black font-mono flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>OAuth Client Created!</span>
              </DialogTitle>
              <DialogDescription className="text-xs font-medium text-[var(--color-text-secondary)]">
                Client &quot;{createdClientResult?.client_name}&quot; is ready for use.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono font-black uppercase text-[var(--color-text-primary)]">
                  Client ID
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={createdClientResult?.client_id || ''}
                    className="pop-input font-mono text-xs font-bold bg-[var(--color-surface-elevated)]"
                  />
                  <Button
                    onClick={() => handleCopy(createdClientResult?.client_id || '', 'created_client_id')}
                    className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-mono font-bold text-xs h-10 px-3 shrink-0"
                  >
                    {copiedKey === 'created_client_id' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              {createdClientResult?.client_secret && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-mono font-black uppercase text-rose-600">
                      Client Secret (One-Time Display)
                    </Label>
                    <span className="pop-badge bg-rose-200 text-rose-900 font-mono text-[9px] font-black">
                      COPY NOW
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      type={secretRevealed ? 'text' : 'password'}
                      value={createdClientResult.client_secret}
                      className="pop-input font-mono text-xs font-bold bg-[var(--color-surface-elevated)]"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSecretRevealed(!secretRevealed)}
                      className="pop-btn h-10 px-2.5 border-2 border-[var(--color-border)]"
                    >
                      {secretRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      onClick={() => handleCopy(createdClientResult.client_secret || '', 'created_client_sec')}
                      className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-mono font-bold text-xs h-10 px-3 shrink-0"
                    >
                      {copiedKey === 'created_client_sec' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setCreatedClientResult(null)}
                  className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-mono font-black text-xs px-6"
                >
                  Done
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Revoke Confirmation Dialog */}
        <Dialog open={Boolean(revokeTarget)} onOpenChange={(open) => !open && setRevokeTarget(null)}>
          <DialogContent className="sm:max-w-[440px] bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)]">
            <DialogHeader>
              <DialogTitle className="text-base font-black font-mono text-rose-600">
                Revoke &quot;{revokeTarget?.client_name}&quot;?
              </DialogTitle>
              <DialogDescription className="text-xs font-medium text-[var(--color-text-secondary)] mt-1">
                Revoking this client immediately invalidates its active access tokens and refresh tokens. The client record is preserved for audit history.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRevokeTarget(null)}
                className="pop-btn text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmRevoke}
                disabled={revoking}
                className="pop-btn bg-rose-500 text-white hover:bg-rose-600 text-xs font-black"
              >
                {revoking ? 'Revoking...' : 'Revoke Access'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="sm:max-w-[440px] bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)]">
            <DialogHeader>
              <DialogTitle className="text-base font-black font-mono text-rose-600">
                Delete &quot;{deleteTarget?.client_name}&quot;?
              </DialogTitle>
              <DialogDescription className="text-xs font-medium text-[var(--color-text-secondary)] mt-1">
                This permanently removes the OAuth client and its associated token history. <strong className="text-[var(--color-text-primary)]">This action cannot be undone.</strong>
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                className="pop-btn text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="pop-btn bg-rose-500 text-white hover:bg-rose-600 text-xs font-black"
              >
                {deleting ? 'Deleting...' : 'Delete permanently'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
