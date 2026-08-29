// components/ui/endpoint-oauth-modal.tsx
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
  Plus,
  Trash2,
  ExternalLink,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface EndpointOAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: {
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

export function EndpointOAuthModal({
  open,
  onOpenChange,
  endpoint,
}: EndpointOAuthModalProps) {
  const [activeTab, setActiveTab] = React.useState<'gemini' | 'clients' | 'diagnostics'>('gemini');

  // Client list & loading
  const [clients, setClients] = React.useState<OAuthClientRecord[]>([]);
  const [loadingClients, setLoadingClients] = React.useState(false);

  // Create Client dialog states
  const [isCreatingClient, setIsCreatingClient] = React.useState(false);
  const [newClientName, setNewClientName] = React.useState('Gemini Spark');
  const [newClientType, setNewClientType] = React.useState<'confidential' | 'public'>('confidential');
  const [newRedirectUri, setNewRedirectUri] = React.useState('https://oauth.google.com/callback');
  const [newScope, setNewScope] = React.useState('mcp:read mcp:write');
  const [creatingSubmitting, setCreatingSubmitting] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // Post-Creation One-Time Secret Display
  const [createdClientResult, setCreatedClientResult] = React.useState<{
    client_id: string;
    client_secret?: string;
    client_name: string;
  } | null>(null);
  const [secretRevealed, setSecretRevealed] = React.useState(false);

  // Revoke confirmation dialog
  const [revokeTarget, setRevokeTarget] = React.useState<OAuthClientRecord | null>(null);
  const [revoking, setRevoking] = React.useState(false);

  // Diagnostics test
  const [testResult, setTestResult] = React.useState<any | null>(null);
  const [testingDiagnostics, setTestingDiagnostics] = React.useState(false);

  // Copy feedback
  const [copiedMap, setCopiedMap] = React.useState<Record<string, boolean>>({});

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMap((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedMap((prev) => ({ ...prev, [key]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const fetchClients = React.useCallback(async () => {
    if (!endpoint) return;
    try {
      setLoadingClients(true);
      const res = await fetch(`/api/endpoints/${endpoint.id}/oauth-clients`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setClients(data);
      }
    } catch (err) {
      console.error('Failed to fetch OAuth clients:', err);
    } finally {
      setLoadingClients(false);
    }
  }, [endpoint]);

  React.useEffect(() => {
    if (open && endpoint) {
      fetchClients();
    }
  }, [open, endpoint, fetchClients]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const mcpUrl = endpoint ? `${origin}/api/mcp/${endpoint.id}/http` : '';

  // Active client for Gemini tab
  const activeClient = clients.find((c) => c.is_active && c.client_name?.toLowerCase().includes('gemini')) || clients.find((c) => c.is_active);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpoint) return;

    setCreateError(null);
    setCreatingSubmitting(true);

    try {
      const res = await fetch(`/api/endpoints/${endpoint.id}/oauth-clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: newClientName.trim(),
          client_type: newClientType,
          redirect_uris: [newRedirectUri.trim()],
          scope: newScope.trim(),
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
      setCreateError(err.message || 'Error creating client');
    } finally {
      setCreatingSubmitting(false);
    }
  };

  const handleRevokeClient = async () => {
    if (!endpoint || !revokeTarget) return;

    try {
      setRevoking(true);
      const res = await fetch(`/api/endpoints/${endpoint.id}/oauth-clients/${revokeTarget.client_id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setRevokeTarget(null);
        fetchClients();
      }
    } catch (err) {
      console.error('Failed to revoke client:', err);
    } finally {
      setRevoking(false);
    }
  };

  const runDiagnostics = async () => {
    if (!endpoint) return;

    try {
      setTestingDiagnostics(true);
      const res = await fetch(`/api/endpoints/${endpoint.id}/oauth-test`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
      }
    } catch (err) {
      console.error('Diagnostics test error:', err);
    } finally {
      setTestingDiagnostics(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[92vh] overflow-y-auto bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)] p-0 gap-0">
        {/* Modal Header */}
        <div className="p-6 pb-4 border-b-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                <Lock className="h-6 w-6 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-black">
                  <span>MCP OAUTH 2.1 AUTHORIZATION</span>
                  <span className="pop-badge bg-emerald-300 text-slate-950 font-black text-[9px] px-1.5 py-0.2">
                    ● ACTIVE
                  </span>
                </div>
                <DialogTitle className="text-xl font-black font-mono tracking-tight text-[var(--color-text-primary)]">
                  OAuth Management & Gemini Spark Setup
                </DialogTitle>
                <DialogDescription className="text-xs text-[var(--color-text-secondary)] font-medium">
                  Endpoint: <strong className="text-[var(--color-text-primary)] font-mono">{endpoint?.name}</strong>
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 border-b-2 border-[var(--color-border)] pt-1 font-mono text-xs font-black">
            {[
              { id: 'gemini', label: '✦ Gemini Spark Setup' },
              { id: 'clients', label: `OAuth Clients (${clients.length})` },
              { id: 'diagnostics', label: 'OAuth Diagnostics' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2 px-3 border-b-2 -mb-[2px] transition-all ${
                  activeTab === tab.id
                    ? 'border-amber-400 text-amber-600 dark:text-amber-400 font-black'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* TAB 1: GEMINI SPARK SETUP */}
          {activeTab === 'gemini' && (
            <div className="space-y-4">
              {/* Introduction Banner */}
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700 text-xs font-medium space-y-1.5 text-slate-900 dark:text-amber-200">
                <div className="font-mono font-black text-sm text-amber-900 dark:text-amber-100 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>Connecting to Gemini Spark via MCP</span>
                </div>
                <p>
                  Gemini Spark uses standard <strong>OAuth 2.1 & RFC 9728 Protected Resource Metadata</strong>.
                  Paste the MCP URL below into Gemini Spark. If automatic client registration falls back to manual credentials, use the Client ID and Client Secret shown below.
                </p>
              </div>

              {/* MCP Server URL Copy Box */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono font-black uppercase text-[var(--color-text-primary)]">
                  MCP Server URL (Streamable HTTP):
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={mcpUrl}
                    readOnly
                    className="pop-input h-10 font-mono text-xs font-bold"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCopy('mcpUrl', mcpUrl)}
                    className="pop-btn py-2 px-3 border-2 border-[var(--color-border)] text-xs font-black shrink-0 gap-1.5 bg-amber-400 text-slate-950 hover:bg-amber-300"
                  >
                    {copiedMap['mcpUrl'] ? (
                      <>
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy URL</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Active Client Details Card */}
              {activeClient ? (
                <div className="pop-card p-4 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                    <span className="font-black text-[var(--color-text-primary)] flex items-center gap-1.5">
                      <Key className="h-4 w-4 text-amber-500" />
                      Active Client: {activeClient.client_name}
                    </span>
                    <span className="pop-badge bg-emerald-300 text-slate-950 text-[9px] font-black">
                      ● {activeClient.client_type.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">
                      Client ID:
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={activeClient.client_id}
                        readOnly
                        className="pop-input h-8 text-xs font-mono font-bold"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy('activeClientId', activeClient.client_id)}
                        className="pop-btn h-8 px-2.5 border-2 border-[var(--color-border)] text-xs"
                      >
                        {copiedMap['activeClientId'] ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl border-2 border-dashed border-[var(--color-border)] text-center space-y-2">
                  <p className="text-xs text-[var(--color-text-muted)] font-mono">
                    No active OAuth client configured for this endpoint.
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      setIsCreatingClient(true);
                      setActiveTab('clients');
                    }}
                    className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs py-2 px-4 gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                  >
                    <Plus className="h-4 w-4 stroke-[3]" />
                    <span>Create Gemini OAuth Client</span>
                  </Button>
                </div>
              )}

              {/* Step-by-Step Instructions */}
              <div className="p-4 rounded-2xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] space-y-2 text-xs font-mono">
                <div className="font-black uppercase text-[10px] text-[var(--color-text-muted)]">
                  Connection Instructions:
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[var(--color-text-secondary)] font-medium">
                  <li>In Gemini Spark, navigate to <strong>Connected Apps &gt; MCP Servers</strong>.</li>
                  <li>Click <strong>Add Server</strong> and paste the MCP Server URL.</li>
                  <li>If prompted for manual credentials, provide the <strong>Client ID</strong> and <strong>Client Secret</strong>.</li>
                  <li>Click <strong>Connect</strong> and approve the OAuth consent screen to complete setup.</li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 2: OAUTH CLIENTS LIST & CREATE */}
          {activeTab === 'clients' && (
            <div className="space-y-4">
              {/* One-Time Secret Display Banner if just created */}
              {createdClientResult && (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-emerald-900 dark:text-emerald-200 text-sm flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 stroke-[3]" />
                      OAuth Client Created Successfully!
                    </span>
                    <button
                      type="button"
                      onClick={() => setCreatedClientResult(null)}
                      className="text-emerald-700 hover:text-emerald-900 font-black"
                    >
                      Dismiss
                    </button>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase text-emerald-800 dark:text-emerald-300">
                      Client ID:
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={createdClientResult.client_id}
                        readOnly
                        className="pop-input h-8 text-xs font-bold"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy('newClientId', createdClientResult.client_id)}
                        className="pop-btn h-8 px-2.5 border-2 border-[var(--color-border)] text-xs"
                      >
                        {copiedMap['newClientId'] ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {createdClientResult.client_secret && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-300">
                        Client Secret (Shown once):
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type={secretRevealed ? 'text' : 'password'}
                          value={createdClientResult.client_secret}
                          readOnly
                          className="pop-input h-8 text-xs font-bold text-amber-900 dark:text-amber-200"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setSecretRevealed(!secretRevealed)}
                          className="pop-btn h-8 px-2.5 border-2 border-[var(--color-border)] text-xs"
                        >
                          {secretRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy('newClientSecret', createdClientResult.client_secret!)}
                          className="pop-btn h-8 px-2.5 border-2 border-[var(--color-border)] text-xs bg-amber-400 text-slate-950 hover:bg-amber-300"
                        >
                          {copiedMap['newClientSecret'] ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                        ⚠️ Store this secret securely. It cannot be shown again once you close this banner.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Create Client Form Dialog */}
              {isCreatingClient ? (
                <form onSubmit={handleCreateClient} className="p-4 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2 font-mono">
                    <span className="font-black text-sm text-[var(--color-text-primary)]">
                      Create New OAuth Client
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingClient(false)}
                      className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] font-bold"
                    >
                      Cancel
                    </button>
                  </div>

                  {createError && (
                    <div className="bg-rose-100 dark:bg-rose-950/60 border border-rose-500 text-rose-700 dark:text-rose-200 text-xs px-3 py-1.5 rounded-lg font-bold">
                      {createError}
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs font-mono font-bold">Client Name</Label>
                    <Input
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="e.g. Gemini Spark"
                      className="pop-input h-9 text-xs font-medium"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-mono font-bold">Client Type</Label>
                      <select
                        value={newClientType}
                        onChange={(e) => setNewClientType(e.target.value as any)}
                        className="pop-input h-9 text-xs font-mono font-bold w-full rounded-xl px-2"
                      >
                        <option value="confidential">Confidential (Secret)</option>
                        <option value="public">Public (PKCE S256)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-mono font-bold">Scopes</Label>
                      <Input
                        value={newScope}
                        onChange={(e) => setNewScope(e.target.value)}
                        className="pop-input h-9 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-mono font-bold">Redirect URI</Label>
                    <Input
                      value={newRedirectUri}
                      onChange={(e) => setNewRedirectUri(e.target.value)}
                      placeholder="https://oauth.google.com/callback"
                      className="pop-input h-9 text-xs font-mono"
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
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
                      disabled={creatingSubmitting}
                      className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                    >
                      {creatingSubmitting ? 'Creating...' : 'Create Client →'}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="font-mono text-xs font-black text-[var(--color-text-secondary)]">
                    Authorized Applications for this Endpoint
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsCreatingClient(true)}
                    className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs py-1.5 px-3 gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                  >
                    <Plus className="h-4 w-4 stroke-[3]" />
                    <span>Create OAuth Client</span>
                  </Button>
                </div>
              )}

              {/* Clients List */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {clients.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-[var(--color-border)] text-center text-xs font-mono text-[var(--color-text-muted)]">
                    No OAuth clients registered yet.
                  </div>
                ) : (
                  clients.map((c) => (
                    <div
                      key={c.id}
                      className="pop-card p-3.5 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-2 font-mono text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-[var(--color-text-primary)]">
                            {c.client_name}
                          </span>
                          <span
                            className={`pop-badge text-[9px] font-black px-1.5 py-0.2 ${
                              c.is_active ? 'bg-emerald-300 text-slate-950' : 'bg-rose-300 text-slate-950'
                            }`}
                          >
                            ● {c.is_active ? 'ACTIVE' : 'REVOKED'}
                          </span>
                        </div>

                        {c.is_active && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setRevokeTarget(c)}
                            className="pop-btn text-rose-600 hover:text-rose-700 text-[11px] h-7 px-2 border border-rose-300 gap-1"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Revoke</span>
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[var(--color-text-secondary)]">
                        <div>
                          <span className="text-[var(--color-text-muted)]">Client ID: </span>
                          <span className="font-bold text-[var(--color-text-primary)]">{c.client_id.slice(0, 20)}...</span>
                        </div>
                        <div>
                          <span className="text-[var(--color-text-muted)]">Type: </span>
                          <span className="font-bold uppercase">{c.client_type} / PKCE</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DIAGNOSTICS */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-black text-[var(--color-text-secondary)]">
                  Live OAuth 2.1 & RFC 9728 Protocol Inspection
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={testingDiagnostics}
                  onClick={runDiagnostics}
                  className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs py-1.5 px-3 gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${testingDiagnostics ? 'animate-spin' : ''}`} />
                  <span>Run Diagnostics</span>
                </Button>
              </div>

              {testResult ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {testResult.checks.map((chk: any, idx: number) => (
                    <div
                      key={idx}
                      className="pop-card p-3 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1 font-mono text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-[var(--color-text-primary)] flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 stroke-[3]" />
                          {chk.name}
                        </span>
                        <span className="pop-badge bg-emerald-300 text-slate-950 text-[9px] font-black">
                          PASS
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-secondary)] font-medium">
                        {chk.detail}
                      </p>
                      {chk.url && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 font-bold truncate">
                          URL: {chk.url}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-2xl border-2 border-dashed border-[var(--color-border)] text-center space-y-2">
                  <Activity className="h-8 w-8 text-amber-500 mx-auto" />
                  <p className="text-xs font-mono text-[var(--color-text-muted)]">
                    Click &ldquo;Run Diagnostics&rdquo; to test PRM, AS discovery, PKCE, and token endpoint connectivity.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] flex justify-end">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs py-2 px-5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
          >
            Done & Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
