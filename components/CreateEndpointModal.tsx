// components/CreateEndpointModal.tsx
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, CheckCircle, ShieldAlert, Server, Check, Lock } from 'lucide-react';

interface CreateEndpointModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateEndpointModal({
  open,
  onOpenChange,
  onSuccess,
}: CreateEndpointModalProps) {
  const [selectedServices, setSelectedServices] = React.useState<Set<string>>(new Set());
  const [endpointName, setEndpointName] = React.useState('');
  const [githubToken, setGithubToken] = React.useState('');
  const [supabaseConnectionString, setSupabaseConnectionString] = React.useState('');
  const [vercelToken, setVercelToken] = React.useState('');
  const [vercelTeamId, setVercelTeamId] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [createdUrl, setCreatedUrl] = React.useState<string | null>(null);
  const [createdApiKey, setCreatedApiKey] = React.useState<string | null>(null);
  const [createdEndpointId, setCreatedEndpointId] = React.useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState(false);

  const resetForm = () => {
    setSelectedServices(new Set());
    setEndpointName('');
    setGithubToken('');
    setSupabaseConnectionString('');
    setVercelToken('');
    setVercelTeamId('');
    setError(null);
    setCreatedUrl(null);
    setCreatedApiKey(null);
    setCreatedEndpointId(null);
    setCopiedUrl(false);
    setCopiedKey(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (selectedServices.size === 0) {
      setError('Please select at least one service to attach.');
      setIsSubmitting(false);
      return;
    }

    const services: any[] = [];

    if (selectedServices.has('github')) {
      if (!githubToken) {
        setError('GitHub token is required.');
        setIsSubmitting(false);
        return;
      }
      services.push({ type: 'github', service_type: 'github', config: { token: githubToken } });
    }
    if (selectedServices.has('supabase')) {
      if (!supabaseConnectionString) {
        setError('PostgreSQL / Supabase connection string is required.');
        setIsSubmitting(false);
        return;
      }
      services.push({
        type: 'supabase',
        service_type: 'supabase',
        config: { connectionString: supabaseConnectionString },
      });
    }
    if (selectedServices.has('vercel')) {
      if (!vercelToken) {
        setError('Vercel token is required.');
        setIsSubmitting(false);
        return;
      }
      services.push({
        type: 'vercel',
        service_type: 'vercel',
        config: { token: vercelToken, teamId: vercelTeamId || undefined },
      });
    }

    try {
      const response = await fetch('/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: endpointName || 'My Endpoint', services }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const url = `${window.location.origin}/api/mcp/${data.id}/http`;
      setCreatedUrl(url);
      setCreatedApiKey(data.apiKey || null);
      setCreatedEndpointId(data.id);
      onSuccess();
    } catch (err: any) {
      console.error('Create endpoint error:', err);
      setError(err.message || 'Failed to create endpoint');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyUrl = async () => {
    if (createdUrl) {
      await navigator.clipboard.writeText(createdUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleCopyKey = async () => {
    if (createdApiKey) {
      await navigator.clipboard.writeText(createdApiKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-[#0a1016] border-white/[0.08] text-white">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Server className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-white">
                {createdUrl ? 'Endpoint Successfully Created' : 'Create MCP Endpoint'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {createdUrl
                  ? 'Your endpoint is now active and ready to receive requests.'
                  : 'Configure service adapters and secure credential boundaries for this endpoint.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {createdUrl ? (
          <div className="space-y-4 py-3">
            <Alert className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <AlertDescription className="text-xs text-emerald-300">
                Endpoint created successfully with AES-256-GCM encrypted service credentials.
              </AlertDescription>
            </Alert>

            {/* Streamable HTTP URL */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Streamable MCP Endpoint URL:</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={createdUrl}
                  readOnly
                  className="flex-1 bg-black/40 border-white/10 text-slate-200 font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyUrl}
                  className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 shrink-0 text-xs gap-1.5"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-slate-400" />
                      <span>Copy URL</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* One-time API Key */}
            {createdApiKey && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <Label className="text-amber-400 font-medium flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" />
                    One-Time MCP API Key (Save this now):
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={createdApiKey}
                    readOnly
                    className="flex-1 bg-black/40 border-amber-500/30 text-amber-200 font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyKey}
                    className="border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 shrink-0 text-xs gap-1.5"
                  >
                    {copiedKey ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Key</span>
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  This key will not be shown again. It is hashed with bcrypt on the server for Bearer authentication.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <Button
                asChild
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs h-10"
              >
                <a href={createdEndpointId ? `/admin/playground?endpoint=${createdEndpointId}` : '/admin/playground'}>
                  <Server className="h-4 w-4 mr-1.5" />
                  Test in Playground
                </a>
              </Button>
              <Button
                onClick={() => handleClose(false)}
                variant="outline"
                className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 font-medium text-xs h-10"
              >
                Done & Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Endpoint Name */}
            <div className="space-y-1.5">
              <Label htmlFor="endpoint-name" className="text-slate-300 text-xs">
                Endpoint Name
              </Label>
              <Input
                id="endpoint-name"
                value={endpointName}
                onChange={(e) => setEndpointName(e.target.value)}
                placeholder="e.g. Workspace Dev Gateway"
                className="bg-black/30 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500 text-xs"
                required
              />
            </div>

            {/* Service Selection */}
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Select Services to Attach</Label>
              <div className="grid grid-cols-3 gap-2">
                {['github', 'supabase', 'vercel'].map((svc) => (
                  <div
                    key={svc}
                    className="flex items-center space-x-2 border border-white/5 bg-white/[0.02] p-2.5 rounded-xl hover:border-white/10 transition"
                  >
                    <Checkbox
                      id={svc}
                      checked={selectedServices.has(svc)}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(selectedServices);
                        if (checked) newSet.add(svc);
                        else newSet.delete(svc);
                        setSelectedServices(newSet);
                      }}
                      className="border-white/20 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                    />
                    <Label htmlFor={svc} className="capitalize text-xs text-slate-300 cursor-pointer">
                      {svc === 'supabase' ? 'PostgreSQL' : svc}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* GitHub Token */}
            {selectedServices.has('github') && (
              <div className="space-y-1.5 border border-white/5 bg-black/20 p-3 rounded-xl">
                <Label htmlFor="github-token" className="text-slate-300 text-xs">
                  GitHub Personal Access Token
                </Label>
                <Input
                  id="github-token"
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_..."
                  className="bg-black/40 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500 text-xs"
                />
              </div>
            )}

            {/* PostgreSQL / Supabase Connection */}
            {selectedServices.has('supabase') && (
              <div className="space-y-1.5 border border-white/5 bg-black/20 p-3 rounded-xl">
                <Label htmlFor="supabase-conn" className="text-slate-300 text-xs">
                  PostgreSQL / Supabase Connection String
                </Label>
                <Input
                  id="supabase-conn"
                  value={supabaseConnectionString}
                  onChange={(e) => setSupabaseConnectionString(e.target.value)}
                  placeholder="postgresql://postgres:password@host:5432/db"
                  className="bg-black/40 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500 text-xs"
                />
                <p className="text-[10px] text-slate-500">
                  Enforced within PostgreSQL read-only transaction (BEGIN READ ONLY).
                </p>
              </div>
            )}

            {/* Vercel Token */}
            {selectedServices.has('vercel') && (
              <div className="space-y-3 border border-white/5 bg-black/20 p-3 rounded-xl">
                <div className="space-y-1.5">
                  <Label htmlFor="vercel-token" className="text-slate-300 text-xs">
                    Vercel Access Token
                  </Label>
                  <Input
                    id="vercel-token"
                    type="password"
                    value={vercelToken}
                    onChange={(e) => setVercelToken(e.target.value)}
                    placeholder="vercel_..."
                    className="bg-black/40 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vercel-team" className="text-slate-300 text-xs">
                    Team ID (Optional)
                  </Label>
                  <Input
                    id="vercel-team"
                    value={vercelTeamId}
                    onChange={(e) => setVercelTeamId(e.target.value)}
                    placeholder="team_..."
                    className="bg-black/40 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500 text-xs"
                  />
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/20 text-rose-400 text-xs">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs"
              >
                {isSubmitting ? 'Creating Endpoint...' : 'Create Endpoint'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}