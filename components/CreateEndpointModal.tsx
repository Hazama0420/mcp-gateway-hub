// components/CreateEndpointModal.tsx

'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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

export function CreateEndpointModal({ open, onOpenChange, onSuccess }: CreateEndpointModalProps) {
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
    setError('Select at least one service.');
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
    services.push({ type: 'github', config: { token: githubToken } });
  }
  if (selectedServices.has('supabase')) {
    if (!supabaseConnectionString) {
      setError('Supabase connection string is required.');
      setIsSubmitting(false);
      return;
    }
    services.push({ type: 'supabase', config: { connectionString: supabaseConnectionString } });
  }
  if (selectedServices.has('vercel')) {
    if (!vercelToken) {
      setError('Vercel token is required.');
      setIsSubmitting(false);
      return;
    }
    services.push({ type: 'vercel', config: { token: vercelToken, teamId: vercelTeamId || undefined } });
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

    const url = `${window.location.origin}/api/mcp/${data.id}/sse`;
    setCreatedUrl(url);
    onSuccess();
  } catch (err: any) {
    console.error('Create endpoint error:', err);
    setError(err.message || 'Failed to create endpoint');
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

  const handleClose = (open: boolean) => {
    if (!open) {
      resetForm();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure New Endpoint</DialogTitle>
        </DialogHeader>

        {createdUrl ? (
          <div className="space-y-4 py-4">
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                Endpoint created successfully!
              </AlertDescription>
            </Alert>
            <div className="flex items-center gap-2">
              <Input value={createdUrl} readOnly className="flex-1" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Copy this URL and paste it into Gemini Spark.</p>
            <Button onClick={() => handleClose(false)} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Input Nama Endpoint */}
            <div className="space-y-1">
              <Label htmlFor="endpoint-name">Endpoint Name</Label>
              <Input
                id="endpoint-name"
                value={endpointName}
                onChange={(e) => setEndpointName(e.target.value)}
                placeholder="My Endpoint"
                required
              />
            </div>

            {/* Pilihan Layanan */}
            <div>
              <Label>Services</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {['github', 'supabase', 'vercel'].map((svc) => (
                  <div key={svc} className="flex items-center space-x-2">
                    <Checkbox
                      id={svc}
                      checked={selectedServices.has(svc)}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(selectedServices);
                        if (checked) newSet.add(svc);
                        else newSet.delete(svc);
                        setSelectedServices(newSet);
                      }}
                    />
                    <Label htmlFor={svc} className="capitalize">{svc}</Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Input dinamis per layanan */}
            {selectedServices.has('github') && (
              <div className="space-y-1">
                <Label htmlFor="github-token">GitHub Personal Access Token</Label>
                <Input
                  id="github-token"
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_..."
                />
              </div>
            )}

            {selectedServices.has('supabase') && (
              <div className="space-y-1">
                <Label htmlFor="supabase-conn">Connection String</Label>
                <Input
                  id="supabase-conn"
                  value={supabaseConnectionString}
                  onChange={(e) => setSupabaseConnectionString(e.target.value)}
                  placeholder="postgresql://postgres:password@host:5432/db"
                />
              </div>
            )}

            {selectedServices.has('vercel') && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="vercel-token">Vercel Access Token</Label>
                  <Input
                    id="vercel-token"
                    type="password"
                    value={vercelToken}
                    onChange={(e) => setVercelToken(e.target.value)}
                    placeholder="vercel_..."
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vercel-team">Team ID (optional)</Label>
                  <Input
                    id="vercel-team"
                    value={vercelTeamId}
                    onChange={(e) => setVercelTeamId(e.target.value)}
                    placeholder="team_..."
                  />
                </div>
              </>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Endpoint'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}