// components/CreateEndpointModal.tsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, CheckCircle } from 'lucide-react';

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
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [endpointName, setEndpointName] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [supabaseConnectionString, setSupabaseConnectionString] = useState('');
  const [vercelToken, setVercelToken] = useState('');
  const [vercelTeamId, setVercelTeamId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = () => {
    setSelectedServices(new Set());
    setEndpointName('');
    setGithubToken('');
    setSupabaseConnectionString('');
    setVercelToken('');
    setVercelTeamId('');
    setError(null);
    setCreatedUrl(null);
    setCopied(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (selectedServices.size === 0) {
      setError('Pilih minimal satu layanan (service).');
      setIsSubmitting(false);
      return;
    }

    const services: any[] = [];

    if (selectedServices.has('github')) {
      if (!githubToken) {
        setError('GitHub token wajib diisi.');
        setIsSubmitting(false);
        return;
      }
      services.push({ type: 'github', service_type: 'github', config: { token: githubToken } });
    }
    if (selectedServices.has('supabase')) {
      if (!supabaseConnectionString) {
        setError('Supabase connection string wajib diisi.');
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
        setError('Vercel token wajib diisi.');
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
      onSuccess();
    } catch (err: any) {
      console.error('Create endpoint error:', err);
      setError(err.message || 'Gagal membuat endpoint');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (createdUrl) {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-[#0a1016] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white text-lg">Konfigurasi Endpoint Baru</DialogTitle>
        </DialogHeader>

        {createdUrl ? (
          <div className="space-y-4 py-4">
            <Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <AlertDescription className="text-emerald-300">
                Endpoint berhasil dibuat!
              </AlertDescription>
            </Alert>
            <div className="flex items-center gap-2">
              <Input
                value={createdUrl}
                readOnly
                className="flex-1 bg-black/40 border-white/10 text-slate-300 font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 shrink-0"
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4 text-slate-400" />
                )}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Salin URL ini dan tempelkan ke client MCP atau Gemini Spark.
            </p>
            <Button
              onClick={() => handleClose(false)}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium rounded-xl"
            >
              Selesai
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Input Nama Endpoint */}
            <div className="space-y-1.5">
              <Label htmlFor="endpoint-name" className="text-slate-300 text-xs">
                Nama Endpoint
              </Label>
              <Input
                id="endpoint-name"
                value={endpointName}
                onChange={(e) => setEndpointName(e.target.value)}
                placeholder="Misal: Workspace Dev Gateway"
                className="bg-black/30 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500"
                required
              />
            </div>

            {/* Pilihan Layanan */}
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs">Pilih Layanan</Label>
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
                      {svc}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Input dinamis per layanan */}
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
              </div>
            )}

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
                    Team ID (opsional)
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
              <Alert variant="destructive" className="bg-red-500/10 border-red-500/20 text-red-400">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 rounded-xl"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium rounded-xl"
              >
                {isSubmitting ? 'Menyimpan...' : 'Buat Endpoint'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}