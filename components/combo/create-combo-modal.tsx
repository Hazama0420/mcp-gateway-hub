// components/combo/create-combo-modal.tsx
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Layers,
  Check,
  Code2,
  Copy,
  Plus,
  PlaySquare,
  Sparkles,
  AlertCircle,
  Globe2,
  GitBranch,
  Database,
  Server,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { BUILTIN_SERVICES, ServiceToolInfo } from '@/lib/adapters/registry';

interface CreateComboModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface UserEndpoint {
  id: string;
  name: string;
  is_active: boolean;
  services: Array<{
    id?: string;
    service_type: string;
  }>;
  tool_count?: number;
}

export function CreateComboModal({
  open,
  onOpenChange,
  onSuccess,
}: CreateComboModalProps) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [endpoints, setEndpoints] = React.useState<UserEndpoint[]>([]);
  const [loadingEndpoints, setLoadingEndpoints] = React.useState(false);
  const [selectedEndpointIds, setSelectedEndpointIds] = React.useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [createdCombo, setCreatedCombo] = React.useState<any | null>(null);
  const [copiedUrl, setCopiedUrl] = React.useState(false);

  // Fetch user's existing endpoints when modal opens
  React.useEffect(() => {
    if (open) {
      setStep(1);
      setName('');
      setDescription('');
      setSelectedEndpointIds(new Set());
      setErrorMessage(null);
      setCreatedCombo(null);
      setCopiedUrl(false);

      const fetchUserEndpoints = async () => {
        try {
          setLoadingEndpoints(true);
          const res = await fetch('/api/endpoints');
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              setEndpoints(data);
            }
          }
        } catch (e) {
          console.error('Failed to fetch endpoints:', e);
        } finally {
          setLoadingEndpoints(false);
        }
      };

      fetchUserEndpoints();
    }
  }, [open]);

  const toggleEndpoint = (epId: string) => {
    const next = new Set(selectedEndpointIds);
    if (next.has(epId)) {
      next.delete(epId);
    } else {
      next.add(epId);
    }
    setSelectedEndpointIds(next);
  };

  const getServiceIcon = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'github':
        return <GitBranch className="h-4 w-4 stroke-[2.5]" />;
      case 'vercel':
        return <Globe2 className="h-4 w-4 stroke-[2.5]" />;
      case 'postgres':
      case 'postgresql':
      case 'supabase':
        return <Database className="h-4 w-4 stroke-[2.5]" />;
      default:
        return <Server className="h-4 w-4 stroke-[2.5]" />;
    }
  };

  // Compute active tools dynamically from selected endpoints
  const activeTools: Array<{ adapterName: string; serviceType: string; tool: ServiceToolInfo }> = React.useMemo(() => {
    const list: Array<{ adapterName: string; serviceType: string; tool: ServiceToolInfo }> = [];
    const selectedList = endpoints.filter((ep) => selectedEndpointIds.has(ep.id));

    selectedList.forEach((ep) => {
      if (Array.isArray(ep.services)) {
        ep.services.forEach((s) => {
          const sType = s.service_type.toLowerCase();
          const svcDef = BUILTIN_SERVICES.find(
            (b) =>
              b.serviceType.toLowerCase() === sType ||
              (b.serviceType === 'postgres' && (sType === 'postgresql' || sType === 'neon' || sType === 'supabase'))
          );

          if (svcDef && Array.isArray(svcDef.tools)) {
            svcDef.tools.forEach((t) => {
              list.push({
                adapterName: ep.name,
                serviceType: svcDef.name,
                tool: t,
              });
            });
          }
        });
      }
    });

    return list;
  }, [endpoints, selectedEndpointIds]);

  const handleCreateCombo = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (!name.trim()) {
        throw new Error('Please enter a name for this Combo.');
      }
      if (selectedEndpointIds.size === 0) {
        throw new Error('Please select at least one adapter for this Combo.');
      }

      const res = await fetch('/api/combo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          endpoint_ids: Array.from(selectedEndpointIds),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create combo');
      }

      setCreatedCombo(data);
      setStep(3); // Success step
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error creating combo');
    } finally {
      setIsSubmitting(false);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://mcp-gateway-hub-beta.vercel.app';
  const comboMcpUrl = createdCombo ? `${origin}/api/mcp/combo/${createdCombo.id}/http` : '';

  const handleCopyUrl = async () => {
    if (!comboMcpUrl) return;
    try {
      await navigator.clipboard.writeText(comboMcpUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (e) {
      console.error('Failed to copy URL:', e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[740px] max-h-[92vh] overflow-y-auto bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)] p-0 gap-0">
        {/* Header */}
        <div className="p-6 pb-4 border-b-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <Layers className="h-6 w-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-black">
                <Sparkles className="h-3.5 w-3.5 text-amber-500 stroke-[2.5]" />
                <span>ADAPTER COMPOSITION</span>
              </div>
              <DialogTitle className="text-lg sm:text-xl font-black font-mono tracking-tight text-[var(--color-text-primary)]">
                {step === 3 ? 'Combo Created Successfully!' : 'Create New Combo'}
              </DialogTitle>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] font-medium">
            Combine multiple existing configured adapters into a single, unified MCP connection URL.
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {errorMessage && (
            <div className="bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-500 text-rose-700 dark:text-rose-200 text-xs px-4 py-2.5 rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Name & Description */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono font-black uppercase text-[var(--color-text-primary)]">
                  Combo Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="e.g. DevOps, Full Stack, Database Gateway..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pop-input h-10 text-xs font-mono font-bold"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono font-black uppercase text-[var(--color-text-primary)]">
                  Description (Optional)
                </Label>
                <Input
                  placeholder="e.g. Unified deployment, repository, and database tools for Gemini Spark"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="pop-input h-10 text-xs font-medium"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] font-medium space-y-1">
                <p className="font-mono font-black text-[var(--color-text-primary)] flex items-center gap-1.5">
                  <span>💡</span> How Combo Works:
                </p>
                <p>
                  Combo references your already configured adapters without duplicating credentials. When created, you will get 1 MCP URL combining all selected tools.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: Select Existing Adapters & Live Tool Preview */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-mono font-black uppercase text-[var(--color-text-primary)]">
                    Select Configured Adapters <span className="text-rose-500">*</span>
                  </Label>
                  <span className="pop-badge bg-amber-300 text-slate-950 font-mono text-[10px] px-2 py-0.5 font-black">
                    {selectedEndpointIds.size} Selected
                  </span>
                </div>

                {loadingEndpoints ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-24 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] animate-pulse" />
                    ))}
                  </div>
                ) : endpoints.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border-2 border-dashed border-[var(--color-border)] space-y-2">
                    <p className="text-xs font-bold text-[var(--color-text-secondary)]">
                      No configured MCP endpoints found.
                    </p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      Please create at least one MCP endpoint under &apos;MCP Endpoints&apos; first.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
                    {endpoints.map((ep) => {
                      const isSelected = selectedEndpointIds.has(ep.id);
                      const primaryService = ep.services?.[0]?.service_type || 'mcp';
                      const epToolCount = ep.tool_count || (ep.services?.length ? ep.services.length * 3 : 0);

                      return (
                        <div
                          key={ep.id}
                          onClick={() => toggleEndpoint(ep.id)}
                          className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer select-none space-y-1.5 ${
                            isSelected
                              ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
                              : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] opacity-75 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-7 w-7 rounded-lg bg-sky-200 dark:bg-sky-900 flex items-center justify-center border border-[var(--color-border)] shrink-0">
                                {getServiceIcon(primaryService)}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-mono font-black text-xs text-[var(--color-text-primary)] truncate">
                                  {ep.name}
                                </h4>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[10px] font-mono text-[var(--color-text-muted)] font-bold capitalize">
                                    {ep.services?.map((s) => s.service_type).join(' • ') || 'Custom'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="pop-badge bg-amber-200 dark:bg-amber-900/60 text-slate-900 dark:text-amber-200 text-[9px] font-mono font-black px-1.5 py-0">
                                {epToolCount} Tools
                              </span>
                              <div
                                className={`w-5 h-5 rounded-md border-2 border-[var(--color-border)] flex items-center justify-center ${
                                  isSelected ? 'bg-amber-400 text-slate-950' : 'bg-white dark:bg-slate-900'
                                }`}
                              >
                                {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Dynamic Live Tool Preview */}
              <div className="space-y-2 pt-3 border-t-2 border-[var(--color-border)]">
                <div className="flex items-center justify-between font-mono text-xs font-black text-[var(--color-text-primary)]">
                  <span className="flex items-center gap-1.5">
                    <Code2 className="h-4 w-4 text-sky-500" />
                    Aggregated Tools Preview
                  </span>
                  <span className="pop-badge bg-emerald-300 text-slate-950 font-mono text-[10px] px-2 py-0.5">
                    {activeTools.length} Total Tools in Combo
                  </span>
                </div>

                <div className="max-h-36 overflow-y-auto p-3 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] space-y-1.5 font-mono text-[11px]">
                  {activeTools.length === 0 ? (
                    <p className="text-[var(--color-text-muted)] italic">
                      No tools active. Please check at least one adapter above.
                    </p>
                  ) : (
                    activeTools.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-0.5 border-b border-black/5 dark:border-white/5 last:border-0"
                      >
                        <span className="font-bold text-[var(--color-text-primary)]">
                          • {item.tool.name}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          {item.adapterName} ({item.serviceType})
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Success Screen */}
          {step === 3 && createdCombo && (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500 text-emerald-900 dark:text-emerald-200 space-y-1">
                <div className="font-mono font-black text-sm flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 stroke-[3]" />
                  <span>Combo &quot;{createdCombo.name}&quot; is Ready!</span>
                </div>
                <p className="text-xs font-medium">
                  {createdCombo.adapters_count || selectedEndpointIds.size} Adapters • {createdCombo.tool_count || activeTools.length} Tools unified under one MCP connection.
                </p>
              </div>

              {/* MCP URL Box */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono font-black uppercase text-[var(--color-text-primary)]">
                  Your Single Combo MCP URL
                </Label>
                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)]">
                  <span className="font-mono text-xs text-[var(--color-text-secondary)] font-bold truncate">
                    {comboMcpUrl}
                  </span>
                  <Button
                    onClick={handleCopyUrl}
                    size="sm"
                    className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-mono font-bold text-xs h-8 px-3 shrink-0 gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="h-3.5 w-3.5 stroke-[3] text-emerald-700" />
                        <span className="text-emerald-700">Copied!</span>
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
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] flex items-center justify-between">
          {step === 3 ? (
            <div className="w-full flex justify-end">
              <Button
                onClick={() => onOpenChange(false)}
                className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-mono font-black text-xs px-6 py-2 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
              >
                Done
              </Button>
            </div>
          ) : (
            <>
              {step === 2 ? (
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="pop-btn text-xs font-bold gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="pop-btn text-xs font-bold"
                >
                  Cancel
                </Button>
              )}

              {step === 1 ? (
                <Button
                  onClick={() => {
                    if (!name.trim()) {
                      setErrorMessage('Please enter a name for this Combo.');
                      return;
                    }
                    setErrorMessage(null);
                    setStep(2);
                  }}
                  className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 text-xs font-black gap-1.5 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
                >
                  <span>Select Adapters</span>
                  <ArrowRight className="h-4 w-4 stroke-[3]" />
                </Button>
              ) : (
                <Button
                  onClick={handleCreateCombo}
                  disabled={isSubmitting || selectedEndpointIds.size === 0}
                  className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 text-xs font-black gap-1.5 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
                >
                  <Plus className="h-4 w-4 stroke-[3]" />
                  <span>{isSubmitting ? 'Creating Combo...' : 'Create Combo'}</span>
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
