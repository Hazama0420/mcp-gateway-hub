// components/endpoints/create-endpoint-wizard.tsx
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
  Server,
  Check,
  Copy,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
  Code2,
  PlaySquare,
  Key,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import {
  BUILTIN_SERVICES,
  ServiceDefinition,
  ServiceCategory,
  formatUserIntegrationAsService,
} from '@/lib/adapters/registry';

interface CreateEndpointWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onOpenPlayground?: (endpointId: string) => void;
  onOpenClientConfig?: (endpoint: any) => void;
  onOpenOAuthModal?: (endpoint: any) => void;
}

export function CreateEndpointWizard({
  open,
  onOpenChange,
  onSuccess,
  onOpenPlayground,
  onOpenClientConfig,
  onOpenOAuthModal,
}: CreateEndpointWizardProps) {
  // Stepper state: 1: Identity, 2: Services, 3: Config, 4: Auth, 5: Review, 6: Success
  const [step, setStep] = React.useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // Form states
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');

  // Service selection
  const [selectedServiceIds, setSelectedServiceIds] = React.useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = React.useState<ServiceCategory>('All');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [expandedToolServiceId, setExpandedToolServiceId] = React.useState<string | null>(null);

  // Custom user integrations fetched from backend
  const [userIntegrations, setUserIntegrations] = React.useState<ServiceDefinition[]>([]);

  // Configurations map: { serviceId: { [fieldKey]: value } }
  const [serviceConfigs, setServiceConfigs] = React.useState<Record<string, Record<string, string>>>({});
  const [revealedPasswords, setRevealedPasswords] = React.useState<Record<string, boolean>>({});

  // Connection testing states
  const [testingServiceId, setTestingServiceId] = React.useState<string | null>(null);
  const [testResults, setTestResults] = React.useState<Record<string, { success: boolean; message: string }>>({});

  // Submission & creation result
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [createdData, setCreatedData] = React.useState<{
    id: string;
    name: string;
    apiKey: string | null;
    httpUrl: string;
    services: any[];
  } | null>(null);

  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState(false);

  // Fetch custom integrations
  React.useEffect(() => {
    if (open) {
      const fetchIntegrations = async () => {
        try {
          const res = await fetch('/api/integrations');
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              setUserIntegrations(data.map(formatUserIntegrationAsService));
            }
          }
        } catch (err) {
          console.error('Failed to load user integrations:', err);
        }
      };
      fetchIntegrations();
    }
  }, [open]);

  // Combine built-in services and custom user integrations
  const allServices: ServiceDefinition[] = React.useMemo(() => {
    return [...BUILTIN_SERVICES, ...userIntegrations];
  }, [userIntegrations]);

  // Filtered services
  const filteredServices = React.useMemo(() => {
    return allServices.filter((svc) => {
      const matchesCategory =
        activeCategory === 'All' || svc.category === activeCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        svc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        svc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        svc.tools.some((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [allServices, activeCategory, searchQuery]);

  // Total tools count for selected services
  const totalSelectedTools = React.useMemo(() => {
    let count = 0;
    for (const id of Array.from(selectedServiceIds)) {
      const svc = allServices.find((s) => s.id === id);
      if (svc) count += svc.toolsCount;
    }
    return count;
  }, [selectedServiceIds, allServices]);

  const resetAll = () => {
    setStep(1);
    setName('');
    setDescription('');
    setSelectedServiceIds(new Set());
    setServiceConfigs({});
    setRevealedPasswords({});
    setTestResults({});
    setErrorMessage(null);
    setCreatedData(null);
    setCopiedUrl(false);
    setCopiedKey(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetAll();
      onOpenChange(false);
    }
  };

  const toggleService = (svcId: string) => {
    const next = new Set(selectedServiceIds);
    if (next.has(svcId)) {
      next.delete(svcId);
    } else {
      next.add(svcId);
    }
    setSelectedServiceIds(next);
  };

  const handleConfigChange = (serviceId: string, fieldKey: string, val: string) => {
    setServiceConfigs((prev) => ({
      ...prev,
      [serviceId]: {
        ...(prev[serviceId] || {}),
        [fieldKey]: val,
      },
    }));
  };

  const togglePasswordReveal = (key: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Test service connection
  const runTestConnection = async (service: ServiceDefinition) => {
    setTestingServiceId(service.id);
    const config = serviceConfigs[service.id] || {};

    try {
      const res = await fetch('/api/endpoints/test-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: service.serviceType,
          config,
        }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [service.id]: {
          success: Boolean(data.success),
          message: data.message || (data.success ? 'Connection verified' : 'Connection failed'),
        },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [service.id]: {
          success: false,
          message: err.message || 'Network error during test',
        },
      }));
    } finally {
      setTestingServiceId(null);
    }
  };

  // Validate step transitions
  const handleNextStep = () => {
    setErrorMessage(null);

    if (step === 1) {
      if (!name.trim()) {
        setErrorMessage('Endpoint name is required.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (selectedServiceIds.size === 0) {
        setErrorMessage('Please select at least one service adapter to attach.');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      // Validate all required credential fields for selected services
      for (const svcId of Array.from(selectedServiceIds)) {
        const svc = allServices.find((s) => s.id === svcId);
        if (svc) {
          const cfg = serviceConfigs[svc.id] || {};
          for (const field of svc.credentialFields) {
            if (field.required && (!cfg[field.key] || !cfg[field.key].trim())) {
              setErrorMessage(`Please provide ${field.label} for ${svc.name}.`);
              return;
            }
          }
        }
      }
      setStep(4);
    } else if (step === 4) {
      setStep(5);
    }
  };

  // Final submission
  const handleCreateEndpoint = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const servicesPayload: any[] = [];

      for (const svcId of Array.from(selectedServiceIds)) {
        const svc = allServices.find((s) => s.id === svcId);
        if (svc) {
          servicesPayload.push({
            type: svc.serviceType,
            service_type: svc.serviceType,
            config: serviceConfigs[svc.id] || {},
          });
        }
      }

      const res = await fetch('/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          services: servicesPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to create endpoint');
      }

      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const httpUrl = `${origin}/api/mcp/${data.id}/http`;

      setCreatedData({
        id: data.id,
        name: data.name,
        apiKey: data.apiKey || null,
        httpUrl,
        services: data.services || [],
      });

      onSuccess();
      setStep(6);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error creating endpoint');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async (type: 'url' | 'key') => {
    if (type === 'url' && createdData?.httpUrl) {
      await navigator.clipboard.writeText(createdData.httpUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
    if (type === 'key' && createdData?.apiKey) {
      await navigator.clipboard.writeText(createdData.apiKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[760px] max-h-[92vh] overflow-y-auto bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)] p-0 gap-0">
        {/* Top Header */}
        <div className="p-6 pb-4 border-b-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                <Server className="h-6 w-6 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-black">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 stroke-[2.5]" />
                  <span>ENDPOINT PROVISIONING WIZARD</span>
                </div>
                <DialogTitle className="text-xl font-black font-mono tracking-tight text-[var(--color-text-primary)]">
                  {step === 6 ? 'MCP Endpoint Created!' : 'Create MCP Gateway Endpoint'}
                </DialogTitle>
              </div>
            </div>
          </div>

          {/* Stepper Progress Bar (Steps 1-5) */}
          {step !== 6 && (
            <div className="grid grid-cols-5 gap-2 pt-1 font-mono text-[11px] font-black">
              {[
                { s: 1, label: '1. Identity' },
                { s: 2, label: '2. Services' },
                { s: 3, label: '3. Config' },
                { s: 4, label: '4. Auth' },
                { s: 5, label: '5. Review' },
              ].map((item) => (
                <div
                  key={item.s}
                  onClick={() => item.s < step && setStep(item.s as any)}
                  className={`py-1.5 px-2 rounded-xl text-center border-2 border-[var(--color-border)] transition-all cursor-pointer select-none ${
                    step === item.s
                      ? 'bg-amber-400 text-slate-950 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                      : step > item.s
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                      : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] opacity-60'
                  }`}
                >
                  {item.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wizard Body */}
        <div className="p-6 space-y-5">
          {errorMessage && (
            <div className="bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-500 text-rose-700 dark:text-rose-200 text-xs px-4 py-2.5 rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: IDENTITY */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono font-black text-[var(--color-text-primary)]">
                  Endpoint Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. production-gateway or dev-tools-gateway"
                  className="pop-input h-11 text-xs font-bold"
                  autoFocus
                />
                <p className="text-[11px] text-[var(--color-text-muted)] font-medium">
                  A unique identifier for this gateway endpoint in your dashboard.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono font-black text-[var(--color-text-primary)]">
                  Description (Optional)
                </Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Gateway combining GitHub issue tracking and production PostgreSQL DB"
                  className="pop-input h-11 text-xs font-medium"
                />
              </div>

              <div className="p-4 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] flex items-center justify-between">
                <div>
                  <div className="font-mono font-black text-xs text-[var(--color-text-primary)]">
                    Initial Status
                  </div>
                  <div className="text-[11px] text-[var(--color-text-secondary)] font-medium">
                    Endpoint starts active and immediately ready to handle Streamable HTTP and SSE requests.
                  </div>
                </div>
                <span className="pop-badge bg-emerald-300 text-slate-950 font-black text-[10px] px-2.5 py-1">
                  ● ACTIVE
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: SERVICE ADAPTER SELECTOR */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Category Pills & Search */}
              <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
                <div className="flex flex-wrap gap-1.5 font-mono text-[10px] font-bold">
                  {(['All', 'Developer Tools', 'Databases', 'Cloud', 'Custom'] as ServiceCategory[]).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg border-2 border-[var(--color-border)] transition-all ${
                          activeCategory === cat
                            ? 'bg-amber-400 text-slate-950 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] font-black'
                            : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]'
                        }`}
                      >
                        {cat}
                      </button>
                    )
                  )}
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search adapters..."
                    className="pop-input h-8 pl-8 text-xs font-medium"
                  />
                </div>
              </div>

              {/* Service Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                {filteredServices.map((svc) => {
                  const isSelected = selectedServiceIds.has(svc.id);
                  const isExpanded = expandedToolServiceId === svc.id;

                  return (
                    <div
                      key={svc.id}
                      onClick={() => toggleService(svc.id)}
                      className={`pop-card p-4 rounded-2xl border-2 cursor-pointer transition-all duration-150 relative select-none ${
                        isSelected
                          ? 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] ring-2 ring-amber-400'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-elevated)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3.5 h-3.5 rounded-full border border-black"
                            style={{ backgroundColor: svc.theme.color }}
                          />
                          <h4 className="font-mono font-black text-sm text-[var(--color-text-primary)]">
                            {svc.name}
                          </h4>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`pop-badge font-mono text-[9px] font-black px-1.5 py-0.5 ${svc.theme.badgeBg} ${svc.theme.badgeText}`}>
                            {svc.toolsCount} Tools
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

                      <p className="text-[11px] text-[var(--color-text-secondary)] font-medium mt-1 line-clamp-2">
                        {svc.description}
                      </p>

                      {/* Tool Preview Accordion Trigger */}
                      <div className="mt-2 pt-2 border-t border-[var(--color-border)] flex items-center justify-between">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedToolServiceId(isExpanded ? null : svc.id);
                          }}
                          className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                        >
                          <span>{isExpanded ? 'Hide Tools' : 'Preview Available Tools'}</span>
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </div>

                      {/* Expanded Tool List */}
                      {isExpanded && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 p-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-1 font-mono text-[10px]"
                        >
                          {svc.tools.map((tool, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[var(--color-text-primary)]">
                              <span className="font-bold truncate text-[11px]">✦ {tool.name}</span>
                              <span className="text-[9px] text-[var(--color-text-muted)] uppercase shrink-0">
                                {tool.permission || 'read'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Selected Services Multi-Chip Summary */}
              {selectedServiceIds.size > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700 flex flex-wrap items-center gap-2">
                  <span className="font-mono font-black text-[10px] uppercase text-amber-900 dark:text-amber-200">
                    Selected ({selectedServiceIds.size} services, {totalSelectedTools} tools):
                  </span>
                  {Array.from(selectedServiceIds).map((id) => {
                    const svc = allServices.find((s) => s.id === id);
                    if (!svc) return null;
                    return (
                      <span
                        key={id}
                        className="pop-badge bg-white dark:bg-slate-900 border border-[var(--color-border)] text-xs font-mono font-bold px-2 py-0.5 flex items-center gap-1 shadow-[1px_1px_0px_0px_rgba(15,23,42,1)]"
                      >
                        <span>{svc.name}</span>
                        <button
                          type="button"
                          onClick={() => toggleService(id)}
                          className="text-rose-500 hover:text-rose-700 font-black ml-1"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: CONFIGURATION */}
          {step === 3 && (
            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
              <div className="text-xs font-mono text-[var(--color-text-secondary)] font-medium">
                Configure credential boundaries for each selected service. All credentials are encrypted with <strong>AES-256-GCM</strong>.
              </div>

              {Array.from(selectedServiceIds).map((svcId) => {
                const svc = allServices.find((s) => s.id === svcId);
                if (!svc) return null;
                const testResult = testResults[svc.id];
                const isTesting = testingServiceId === svc.id;

                return (
                  <div
                    key={svc.id}
                    className="pop-card p-4 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] space-y-3"
                  >
                    <div className="flex items-center justify-between border-b-2 border-[var(--color-border)] pb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3.5 h-3.5 rounded-full border border-black"
                          style={{ backgroundColor: svc.theme.color }}
                        />
                        <h4 className="font-mono font-black text-sm text-[var(--color-text-primary)]">
                          {svc.name} Configuration
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)]">
                        🔒 Encrypted Storage
                      </span>
                    </div>

                    {svc.credentialFields.map((field) => {
                      const inputVal = serviceConfigs[svc.id]?.[field.key] || '';
                      const isRevealed = revealedPasswords[`${svc.id}_${field.key}`];

                      return (
                        <div key={field.key} className="space-y-1">
                          <Label className="text-xs font-mono font-bold text-[var(--color-text-primary)]">
                            {field.label} {field.required && <span className="text-rose-500">*</span>}
                          </Label>
                          <div className="relative">
                            <Input
                              type={field.type === 'password' && !isRevealed ? 'password' : 'text'}
                              value={inputVal}
                              onChange={(e) => handleConfigChange(svc.id, field.key, e.target.value)}
                              placeholder={field.placeholder}
                              className="pop-input h-10 pr-10 text-xs font-mono"
                            />
                            {field.type === 'password' && (
                              <button
                                type="button"
                                onClick={() => togglePasswordReveal(`${svc.id}_${field.key}`)}
                                className="absolute right-3 top-2.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
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

                    {/* Test Connection Button */}
                    {svc.testable && (
                      <div className="flex items-center justify-between pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isTesting}
                          onClick={() => runTestConnection(svc)}
                          className="pop-btn text-xs font-mono font-bold py-1 px-3 border-2 border-[var(--color-border)] gap-1.5"
                        >
                          <RefreshCw className={`h-3 w-3 ${isTesting ? 'animate-spin' : ''}`} />
                          <span>{isTesting ? 'Testing Connection...' : 'Test Connection'}</span>
                        </Button>

                        {testResult && (
                          <div
                            className={`text-[11px] font-mono font-bold flex items-center gap-1.5 ${
                              testResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {testResult.success ? (
                              <CheckCircle2 className="h-4 w-4 stroke-[2.5]" />
                            ) : (
                              <AlertCircle className="h-4 w-4 stroke-[2.5]" />
                            )}
                            <span>{testResult.message}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* STEP 4: AUTHENTICATION & PROTOCOLS */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="text-xs font-mono text-[var(--color-text-secondary)] font-medium">
                MCP Gateway Hub automatically provisions dual authentication and standard protocols for this endpoint:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* OAuth 2.1 Card */}
                <div className="pop-card p-4 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-amber-500 stroke-[2.5]" />
                      <h4 className="font-mono font-black text-sm text-[var(--color-text-primary)]">
                        OAuth 2.1
                      </h4>
                    </div>
                    <span className="pop-badge bg-emerald-300 text-slate-950 text-[9px] font-mono font-black">
                      ● AVAILABLE
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-secondary)] font-medium">
                    Standards-based PKCE S256 authorization code flow & RFC 9728 Protected Resource Metadata for <strong>Gemini Spark</strong> and remote AI agents.
                  </p>
                </div>

                {/* API Key Card */}
                <div className="pop-card p-4 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-sky-500 stroke-[2.5]" />
                      <h4 className="font-mono font-black text-sm text-[var(--color-text-primary)]">
                        Endpoint API Key
                      </h4>
                    </div>
                    <span className="pop-badge bg-sky-300 text-slate-950 text-[9px] font-mono font-black">
                      ● ENABLED
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-secondary)] font-medium">
                    Static Bearer token verified via bcrypt hash for local desktop clients (Claude Desktop, Cursor AI).
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700 text-xs font-mono space-y-1 text-slate-900 dark:text-amber-200">
                <div className="font-black uppercase text-[10px]">Supported Wire Protocols:</div>
                <div className="flex items-center gap-4 text-[11px]">
                  <span>✦ <strong>Streamable HTTP</strong> (POST /api/mcp/&lt;id&gt;/http)</span>
                  <span>✦ <strong>SSE</strong> (GET /api/mcp/&lt;id&gt;/sse)</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: REVIEW & CREATION */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="text-xs font-mono text-[var(--color-text-secondary)] font-medium">
                Review your endpoint configuration before provisioning:
              </div>

              <div className="pop-card p-4 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between border-b-2 border-[var(--color-border)] pb-2">
                  <span className="text-[var(--color-text-muted)] font-black uppercase text-[10px]">Endpoint:</span>
                  <span className="font-black text-sm text-[var(--color-text-primary)]">{name}</span>
                </div>

                {description && (
                  <div className="flex items-center justify-between border-b-2 border-[var(--color-border)] pb-2">
                    <span className="text-[var(--color-text-muted)] font-black uppercase text-[10px]">Description:</span>
                    <span className="font-medium text-[var(--color-text-secondary)] truncate max-w-xs">{description}</span>
                  </div>
                )}

                <div className="space-y-1.5 border-b-2 border-[var(--color-border)] pb-2">
                  <div className="text-[var(--color-text-muted)] font-black uppercase text-[10px]">
                    Attached Services ({selectedServiceIds.size}):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(selectedServiceIds).map((id) => {
                      const svc = allServices.find((s) => s.id === id);
                      if (!svc) return null;
                      return (
                        <span
                          key={id}
                          className={`pop-badge text-[11px] font-black px-2 py-0.5 ${svc.theme.badgeBg} ${svc.theme.badgeText}`}
                        >
                          {svc.name} ({svc.toolsCount} Tools)
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[var(--color-text-muted)] font-black uppercase text-[10px]">Total MCP Tools:</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                    {totalSelectedTools} Tools Registered
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: SUCCESS & POST-CREATION ACTIONS */}
          {step === 6 && createdData && (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 border-2 border-emerald-500 text-emerald-900 dark:text-emerald-200 space-y-1">
                <div className="flex items-center gap-2 font-mono font-black text-sm">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 stroke-[3]" />
                  <span>Endpoint Successfully Provisioned & Active!</span>
                </div>
                <p className="text-xs font-medium">
                  Your MCP server is live with AES-256-GCM encrypted service credentials and dual OAuth 2.1 + API key authentication.
                </p>
              </div>

              {/* Streamable HTTP URL Copy Box */}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono font-black text-[var(--color-text-primary)] uppercase">
                  MCP Streamable Server URL:
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={createdData.httpUrl}
                    readOnly
                    className="pop-input h-10 font-mono text-xs font-bold"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCopy('url')}
                    className="pop-btn py-2 px-3 border-2 border-[var(--color-border)] text-xs font-black shrink-0 gap-1.5 bg-amber-400 text-slate-950 hover:bg-amber-300"
                  >
                    {copiedUrl ? (
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

              {/* One-Time API Key Display Box */}
              {createdData.apiKey && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono font-black text-amber-900 dark:text-amber-200">
                    <span className="flex items-center gap-1.5">
                      <Lock className="h-4 w-4 text-amber-600 stroke-[2.5]" />
                      One-Time Endpoint API Key (Save this now):
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={createdData.apiKey}
                      readOnly
                      className="pop-input h-10 font-mono text-xs font-bold bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-200"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleCopy('key')}
                      className="pop-btn py-2 px-3 border-2 border-[var(--color-border)] text-xs font-black shrink-0 gap-1.5 bg-amber-400 text-slate-950 hover:bg-amber-300"
                    >
                      {copiedKey ? (
                        <>
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy Key</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] font-mono text-[var(--color-text-secondary)]">
                    This key will not be shown again. It is bcrypt-hashed for Bearer authentication.
                  </p>
                </div>
              )}

              {/* Post-Creation Action Matrix */}
              <div className="space-y-2 pt-2 border-t-2 border-[var(--color-border)]">
                <div className="text-[10px] font-mono font-black uppercase text-[var(--color-text-muted)]">
                  Next Actions:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      handleClose(false);
                      if (onOpenPlayground) onOpenPlayground(createdData.id);
                      else window.location.href = `/admin/playground?endpoint=${createdData.id}`;
                    }}
                    className="pop-btn bg-emerald-400 text-slate-950 hover:bg-emerald-300 font-black text-xs py-2.5 gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                  >
                    <PlaySquare className="h-4 w-4 stroke-[2.5]" />
                    <span>Test in Playground</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      handleClose(false);
                      if (onOpenClientConfig) onOpenClientConfig(createdData);
                    }}
                    className="pop-btn border-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] font-black text-xs py-2.5 gap-1.5"
                  >
                    <Code2 className="h-4 w-4 stroke-[2.5]" />
                    <span>Client Config</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      handleClose(false);
                      if (onOpenOAuthModal) onOpenOAuthModal(createdData);
                    }}
                    className="pop-btn border-2 border-[var(--color-border)] bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs py-2.5 gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                  >
                    <Lock className="h-4 w-4 stroke-[2.5]" />
                    <span>Manage OAuth</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer */}
        <div className="p-4 border-t-2 border-[var(--color-border)] bg-[var(--color-surface-elevated)] flex items-center justify-between">
          {step === 6 ? (
            <div className="w-full flex justify-end">
              <Button
                type="button"
                onClick={() => handleClose(false)}
                className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs py-2.5 px-6 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
              >
                Done & Close
              </Button>
            </div>
          ) : (
            <>
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((step - 1) as any)}
                  className="pop-btn py-2 px-4 border-2 border-[var(--color-border)] text-xs font-bold gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleClose(false)}
                  className="pop-btn py-2 px-4 border-2 border-[var(--color-border)] text-xs font-bold"
                >
                  Cancel
                </Button>
              )}

              {step < 5 ? (
                <Button
                  type="button"
                  onClick={handleNextStep}
                  className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs py-2 px-5 gap-1.5 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
                >
                  <span>Continue</span>
                  <ArrowRight className="h-4 w-4 stroke-[3]" />
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleCreateEndpoint}
                  className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs py-2.5 px-6 gap-2 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]"
                >
                  <span>{isSubmitting ? 'Provisioning Endpoint...' : 'CREATE MCP ENDPOINT →'}</span>
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
