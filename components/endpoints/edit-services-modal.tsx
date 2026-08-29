// components/endpoints/edit-services-modal.tsx
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
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Code2,
  Save,
  Globe2,
  GitBranch,
  Database,
  Server,
  Sparkles,
} from 'lucide-react';
import {
  BUILTIN_SERVICES,
  ServiceToolInfo,
} from '@/lib/adapters/registry';

interface EditServicesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: any | null;
  onSuccess: () => void;
}

export function EditServicesModal({
  open,
  onOpenChange,
  endpoint,
  onSuccess,
}: EditServicesModalProps) {
  const [selectedServiceTypes, setSelectedServiceTypes] = React.useState<Set<string>>(new Set());
  const [serviceConfigs, setServiceConfigs] = React.useState<Record<string, Record<string, string>>>({});
  const [revealedPasswords, setRevealedPasswords] = React.useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Initialize selected services from endpoint when opened
  React.useEffect(() => {
    if (open && endpoint) {
      const activeTypes = new Set<string>();
      if (Array.isArray(endpoint.services)) {
        endpoint.services.forEach((s: any) => {
          activeTypes.add(s.service_type.toLowerCase());
        });
      }
      setSelectedServiceTypes(activeTypes);
      setServiceConfigs({});
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [open, endpoint]);

  const toggleService = (svcType: string) => {
    const next = new Set(selectedServiceTypes);
    const key = svcType.toLowerCase();
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedServiceTypes(next);
  };

  const handleConfigChange = (svcId: string, fieldKey: string, value: string) => {
    setServiceConfigs((prev) => ({
      ...prev,
      [svcId]: {
        ...(prev[svcId] || {}),
        [fieldKey]: value,
      },
    }));
  };

  const togglePasswordVisibility = (key: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Compute active tools dynamically from selected services
  const activeTools: Array<{ serviceName: string; tool: ServiceToolInfo }> = React.useMemo(() => {
    const list: Array<{ serviceName: string; tool: ServiceToolInfo }> = [];
    BUILTIN_SERVICES.forEach((svc) => {
      const isSelected = selectedServiceTypes.has(svc.serviceType.toLowerCase());
      if (isSelected && Array.isArray(svc.tools)) {
        svc.tools.forEach((t) => {
          list.push({ serviceName: svc.name, tool: t });
        });
      }
    });
    return list;
  }, [selectedServiceTypes]);

  const handleSaveServices = async () => {
    if (!endpoint) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (selectedServiceTypes.size === 0) {
        throw new Error('Please keep at least one service attached to this connection bundle.');
      }

      // Check if newly added services require credentials
      for (const sType of Array.from(selectedServiceTypes)) {
        const svcDef = BUILTIN_SERVICES.find(
          (s) => s.serviceType.toLowerCase() === sType.toLowerCase()
        );
        const wasAlreadyAttached = endpoint.services?.some(
          (s: any) => s.service_type.toLowerCase() === sType.toLowerCase()
        );

        if (svcDef && !wasAlreadyAttached) {
          const cfg = serviceConfigs[svcDef.id] || {};
          for (const field of svcDef.credentialFields) {
            if (field.required && (!cfg[field.key] || !cfg[field.key].trim())) {
              throw new Error(`Please provide ${field.label} for newly enabled service: ${svcDef.name}.`);
            }
          }
        }
      }

      const servicesPayload = Array.from(selectedServiceTypes).map((sType) => {
        const svcDef = BUILTIN_SERVICES.find(
          (s) => s.serviceType.toLowerCase() === sType.toLowerCase()
        );
        const config = svcDef ? serviceConfigs[svcDef.id] : undefined;
        return {
          service_type: sType,
          config,
        };
      });

      const res = await fetch('/api/endpoints', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: endpoint.id,
          services: servicesPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to update services');
      }

      setSuccessMessage(`Successfully updated services bundle (${data.tool_count || activeTools.length} tools active).`);
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error updating services bundle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getServiceIcon = (sType: string) => {
    switch (sType.toLowerCase()) {
      case 'github':
        return <GitBranch className="h-5 w-5 stroke-[2.5]" />;
      case 'vercel':
        return <Globe2 className="h-5 w-5 stroke-[2.5]" />;
      case 'postgres':
      case 'postgresql':
      case 'supabase':
        return <Database className="h-5 w-5 stroke-[2.5]" />;
      default:
        return <Server className="h-5 w-5 stroke-[2.5]" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)] p-0 gap-0">
        {/* Header */}
        <div className="p-6 pb-4 border-b-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <Layers className="h-6 w-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-black">
                <Sparkles className="h-3.5 w-3.5 text-amber-500 stroke-[2.5]" />
                <span>SERVICE BUNDLE CONFIGURATION</span>
              </div>
              <DialogTitle className="text-lg sm:text-xl font-black font-mono tracking-tight text-[var(--color-text-primary)]">
                Edit Services: {endpoint?.name}
              </DialogTitle>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] font-medium">
            Attach or detach backend services from this connection bundle. Tools will dynamically update across your single MCP URL.
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {errorMessage && (
            <div className="bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-500 text-rose-700 dark:text-rose-200 text-xs px-4 py-2.5 rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-500 text-emerald-800 dark:text-emerald-200 text-xs px-4 py-2.5 rounded-xl font-bold flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-600 stroke-[3]" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Service Cards */}
          <div className="space-y-3">
            <Label className="text-xs font-mono font-black text-[var(--color-text-primary)] uppercase">
              Choose Services for this Connection
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BUILTIN_SERVICES.map((svc) => {
                const isSelected = selectedServiceTypes.has(svc.serviceType.toLowerCase());
                const wasAlreadyAttached = endpoint?.services?.some(
                  (s: any) => s.service_type.toLowerCase() === svc.serviceType.toLowerCase()
                );

                return (
                  <div
                    key={svc.id}
                    onClick={() => toggleService(svc.serviceType)}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer select-none space-y-2 ${
                      isSelected
                        ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="h-9 w-9 rounded-xl flex items-center justify-center border-2 border-[var(--color-border)] shadow-[1px_1px_0px_0px_rgba(15,23,42,1)]"
                          style={{ backgroundColor: svc.theme.color, color: '#fff' }}
                        >
                          {getServiceIcon(svc.serviceType)}
                        </div>
                        <div>
                          <div className="font-mono font-black text-xs text-[var(--color-text-primary)] flex items-center gap-1.5">
                            <span>{svc.name}</span>
                            {wasAlreadyAttached && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                                Configured
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-[var(--color-text-muted)] font-bold">
                            {svc.toolsCount} Tools Included
                          </span>
                        </div>
                      </div>
                      <div
                        className={`h-5 w-5 rounded-md border-2 border-[var(--color-border)] flex items-center justify-center ${
                          isSelected ? 'bg-amber-400 text-slate-950' : 'bg-[var(--color-surface)]'
                        }`}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)] line-clamp-2">
                      {svc.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Credential Inputs for Newly Selected Services */}
          {Array.from(selectedServiceTypes).some((sType) => {
            const wasAttached = endpoint?.services?.some(
              (s: any) => s.service_type.toLowerCase() === sType.toLowerCase()
            );
            return !wasAttached;
          }) && (
            <div className="space-y-4 pt-3 border-t-2 border-[var(--color-border)]">
              <div className="flex items-center gap-2 font-mono font-black text-xs text-[var(--color-text-primary)]">
                <Lock className="h-4 w-4 text-amber-500" />
                <span>Configure Credentials for Newly Added Services</span>
              </div>

              {Array.from(selectedServiceTypes).map((sType) => {
                const wasAttached = endpoint?.services?.some(
                  (s: any) => s.service_type.toLowerCase() === sType.toLowerCase()
                );
                if (wasAttached) return null;

                const svc = BUILTIN_SERVICES.find(
                  (s) => s.serviceType.toLowerCase() === sType.toLowerCase()
                );
                if (!svc) return null;

                return (
                  <div
                    key={svc.id}
                    className="p-4 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] space-y-3"
                  >
                    <div className="font-mono font-black text-xs text-[var(--color-text-primary)] flex items-center gap-2">
                      {getServiceIcon(svc.serviceType)}
                      <span>{svc.name} Credentials</span>
                    </div>

                    {svc.credentialFields.map((field) => {
                      const fieldStateKey = `${svc.id}_${field.key}`;
                      const isRevealed = revealedPasswords[fieldStateKey] || false;
                      const isPassword = field.type === 'password';

                      return (
                        <div key={field.key} className="space-y-1">
                          <Label className="text-[11px] font-mono font-bold text-[var(--color-text-primary)]">
                            {field.label} {field.required && <span className="text-rose-500">*</span>}
                          </Label>
                          <div className="relative">
                            <Input
                              type={isPassword && !isRevealed ? 'password' : 'text'}
                              placeholder={field.placeholder}
                              value={serviceConfigs[svc.id]?.[field.key] || ''}
                              onChange={(e) => handleConfigChange(svc.id, field.key, e.target.value)}
                              className="pop-input h-9 text-xs font-mono pr-9"
                            />
                            {isPassword && (
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(fieldStateKey)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                              >
                                {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
                          {field.helpText && (
                            <p className="text-[10px] text-[var(--color-text-muted)] font-medium">
                              {field.helpText}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Real-time Dynamic Tool Preview */}
          <div className="space-y-2.5 pt-3 border-t-2 border-[var(--color-border)]">
            <div className="flex items-center justify-between font-mono text-xs font-black text-[var(--color-text-primary)]">
              <span className="flex items-center gap-1.5">
                <Code2 className="h-4 w-4 text-sky-500" />
                Active Tools Preview
              </span>
              <span className="pop-badge bg-amber-300 text-slate-950 font-mono text-[10px] px-2 py-0.5">
                {activeTools.length} Tools in Bundle
              </span>
            </div>

            <div className="max-h-40 overflow-y-auto p-3 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] space-y-1.5 font-mono text-[11px]">
              {activeTools.length === 0 ? (
                <p className="text-[var(--color-text-muted)] italic">No tools active (select at least one service).</p>
              ) : (
                activeTools.map(({ serviceName, tool }, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-0.5 border-b border-black/5 dark:border-white/5 last:border-0">
                    <span className="font-bold text-[var(--color-text-primary)]">
                      • {tool.name}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {serviceName}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="pop-btn text-xs font-bold"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveServices}
            disabled={isSubmitting || selectedServiceTypes.size === 0}
            className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 text-xs font-black gap-1.5 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
          >
            <Save className="h-4 w-4 stroke-[2.5]" />
            <span>{isSubmitting ? 'Saving Changes...' : 'Save Services Bundle'}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
