// app/admin/playground/page.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  PlaySquare,
  Play,
  Terminal,
  Server,
  Boxes,
  Wrench,
  Check,
  Copy,
  FileJson,
  RotateCcw,
  Loader2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Power,
  ShieldCheck,
  Database,
  Globe2,
  Activity,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CodeBlock } from '@/components/ui/code-block';

function PlaygroundContent() {
  const searchParams = useSearchParams();
  const initialEndpointParam = searchParams.get('endpoint') || '';
  const initialIntegrationParam = searchParams.get('integration') || '';

  // Mode: 'ENDPOINT' (Mode B) or 'INTEGRATION' (Mode A)
  const [activeMode, setActiveMode] = React.useState<'ENDPOINT' | 'INTEGRATION'>(
    initialIntegrationParam && !initialEndpointParam ? 'INTEGRATION' : 'ENDPOINT'
  );

  // Targets
  const [endpoints, setEndpoints] = React.useState<any[]>([]);
  const [integrations, setIntegrations] = React.useState<any[]>([]);
  const [loadingTargets, setLoadingTargets] = React.useState<boolean>(true);

  // Selected state
  const [selectedEndpointId, setSelectedEndpointId] = React.useState<string>(initialEndpointParam);
  const [selectedIntegrationId, setSelectedIntegrationId] = React.useState<string>(initialIntegrationParam);
  const [selectedEndpointData, setSelectedEndpointData] = React.useState<any>(null);

  // Tools state
  const [tools, setTools] = React.useState<any[]>([]);
  const [loadingTools, setLoadingTools] = React.useState<boolean>(false);
  const [selectedToolId, setSelectedToolId] = React.useState<string>('');
  const [selectedTool, setSelectedTool] = React.useState<any>(null);

  // Form & JSON arguments
  const [formArgs, setFormArgs] = React.useState<Record<string, any>>({});
  const [rawJsonMode, setRawJsonMode] = React.useState<boolean>(false);
  const [rawJsonArgs, setRawJsonArgs] = React.useState<string>('{}');

  // Execution state
  const [executing, setExecuting] = React.useState<boolean>(false);
  const [executionResult, setExecutionResult] = React.useState<any>(null);
  const [copiedResponse, setCopiedResponse] = React.useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = React.useState<boolean>(false);

  // 1. Fetch available targets (Integrations + Endpoints)
  const fetchTargets = async () => {
    try {
      setLoadingTargets(true);
      const res = await fetch('/api/playground/data');
      const data = await res.json();

      const epList = data.endpoints || [];
      const intList = data.integrations || [];

      setEndpoints(epList);
      setIntegrations(intList);

      // Handle initial selections
      if (initialEndpointParam && epList.some((e: any) => e.id === initialEndpointParam)) {
        setActiveMode('ENDPOINT');
        setSelectedEndpointId(initialEndpointParam);
      } else if (initialIntegrationParam && intList.some((i: any) => i.id === initialIntegrationParam)) {
        setActiveMode('INTEGRATION');
        setSelectedIntegrationId(initialIntegrationParam);
      } else if (epList.length > 0) {
        setSelectedEndpointId(epList[0].id);
      } else if (intList.length > 0) {
        setActiveMode('INTEGRATION');
        setSelectedIntegrationId(intList[0].id);
      }
    } catch (e) {
      console.error('Failed to load playground targets:', e);
    } finally {
      setLoadingTargets(false);
    }
  };

  React.useEffect(() => {
    fetchTargets();
  }, []);

  // 2. Fetch tools when target changes
  React.useEffect(() => {
    if (activeMode === 'ENDPOINT') {
      if (!selectedEndpointId) {
        setTools([]);
        setSelectedTool(null);
        return;
      }
      fetchEndpointTools(selectedEndpointId);
    } else {
      if (!selectedIntegrationId) {
        setTools([]);
        setSelectedTool(null);
        return;
      }
      fetchIntegrationTools(selectedIntegrationId);
    }
  }, [activeMode, selectedEndpointId, selectedIntegrationId]);

  async function fetchEndpointTools(epId: string) {
    try {
      setLoadingTools(true);
      const res = await fetch(`/api/playground/data?endpointId=${epId}`);
      const data = await res.json();

      setSelectedEndpointData(data.endpoint || null);
      const toolList = data.tools || [];
      setTools(toolList);

      if (toolList.length > 0) {
        const first = toolList[0];
        setSelectedToolId(first.name);
        setSelectedTool(first);
        initializeArgs(first);
      } else {
        setSelectedToolId('');
        setSelectedTool(null);
        setFormArgs({});
        setRawJsonArgs('{}');
      }
    } catch (e) {
      console.error('Failed to load endpoint tools:', e);
    } finally {
      setLoadingTools(false);
    }
  }

  async function fetchIntegrationTools(intId: string) {
    try {
      setLoadingTools(true);
      const res = await fetch(`/api/playground/data?integrationId=${intId}`);
      const data = await res.json();
      const toolList = data.tools || [];
      setTools(toolList);

      if (toolList.length > 0) {
        const first = toolList[0];
        setSelectedToolId(first.id);
        setSelectedTool(first);
        initializeArgs(first);
      } else {
        setSelectedToolId('');
        setSelectedTool(null);
        setFormArgs({});
        setRawJsonArgs('{}');
      }
    } catch (e) {
      console.error('Failed to load integration tools:', e);
    } finally {
      setLoadingTools(false);
    }
  }

  function handleToolChange(targetIdOrName: string) {
    setSelectedToolId(targetIdOrName);
    const tool = tools.find((t) => (activeMode === 'ENDPOINT' ? t.name === targetIdOrName : t.id === targetIdOrName));
    setSelectedTool(tool);
    initializeArgs(tool);
    setExecutionResult(null);
  }

  function initializeArgs(tool: any) {
    if (!tool) return;
    let schema: any = {};
    try {
      schema =
        typeof tool.input_schema === 'string'
          ? JSON.parse(tool.input_schema)
          : tool.input_schema || {};
    } catch {
      schema = {};
    }

    const initial: Record<string, any> = {};
    if (schema.properties) {
      for (const [key, val] of Object.entries<any>(schema.properties)) {
        initial[key] = val.default !== undefined ? val.default : '';
      }
    }

    setFormArgs(initial);
    setRawJsonArgs(JSON.stringify(initial, null, 2));
  }

  function handleFormArgChange(key: string, value: any) {
    const updated = { ...formArgs, [key]: value };
    setFormArgs(updated);
    setRawJsonArgs(JSON.stringify(updated, null, 2));
  }

  async function handleExecute() {
    if (!selectedTool) return;
    setExecuting(true);
    setExecutionResult(null);

    let finalArgs: Record<string, any> = {};
    if (rawJsonMode) {
      try {
        finalArgs = JSON.parse(rawJsonArgs);
      } catch (err: any) {
        setExecutionResult({
          success: false,
          status: 400,
          statusText: 'Bad Request',
          latencyMs: 0,
          error: `Invalid JSON Arguments: ${err.message}`,
        });
        setExecuting(false);
        return;
      }
    } else {
      finalArgs = formArgs;
    }

    try {
      const payload =
        activeMode === 'ENDPOINT'
          ? {
              endpointId: selectedEndpointId,
              toolName: selectedTool.name,
              args: finalArgs,
            }
          : {
              toolId: selectedTool.id,
              args: finalArgs,
            };

      const res = await fetch('/api/playground/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setExecutionResult(data);
    } catch (err: any) {
      setExecutionResult({
        success: false,
        status: 500,
        statusText: 'Internal Error',
        latencyMs: 0,
        error: err.message || 'Execution failed to connect',
      });
    } finally {
      setExecuting(false);
    }
  }

  const handleCopyResult = async () => {
    if (!executionResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(executionResult.response || executionResult, null, 2));
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    } catch (err) {
      console.error('Failed to copy response:', err);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const currentEndpointUrl = selectedEndpointId ? `${origin}/api/mcp/${selectedEndpointId}/http` : '';

  const handleCopyUrl = async () => {
    if (!currentEndpointUrl) return;
    try {
      await navigator.clipboard.writeText(currentEndpointUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  let schemaObj: any = {};
  try {
    if (selectedTool?.input_schema) {
      schemaObj =
        typeof selectedTool.input_schema === 'string'
          ? JSON.parse(selectedTool.input_schema)
          : selectedTool.input_schema;
    }
  } catch {
    schemaObj = {};
  }

  const isEndpointInactive = activeMode === 'ENDPOINT' && selectedEndpointData && !selectedEndpointData.is_active;

  return (
    <AppShell>
      {/* Top Banner & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="pop-badge bg-amber-300 text-slate-950">
              ✦ MCP PLAYGROUND
            </span>
            <span className="pop-badge bg-[var(--color-pop-mint)] text-slate-950">
              Realtime Tool Execution
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] tracking-tight font-mono mt-2 flex items-center gap-2">
            <PlaySquare className="h-6 w-6 stroke-[2.5]" />
            <span>MCP Testing & Execution Console</span>
          </h1>
          <p className="text-xs sm:text-sm font-medium text-[var(--color-text-secondary)] mt-1">
            Test and verify your MCP endpoints and API integrations before connecting to Claude Desktop or Cursor.
          </p>
        </div>

        {/* Mode Selector Segmented Control */}
        <div className="flex items-center rounded-2xl bg-[var(--color-surface)] p-1.5 border-2 border-[var(--color-border)] shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
          <button
            onClick={() => {
              setActiveMode('ENDPOINT');
              setExecutionResult(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeMode === 'ENDPOINT'
                ? 'bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-2 border-transparent'
            }`}
          >
            <Server className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>MCP Endpoint Test</span>
          </button>
          <button
            onClick={() => {
              setActiveMode('INTEGRATION');
              setExecutionResult(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeMode === 'INTEGRATION'
                ? 'bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border-2 border-transparent'
            }`}
          >
            <Boxes className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Integration Test</span>
          </button>
        </div>
      </div>

      {loadingTargets ? (
        <div className="h-64 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-6 animate-pulse space-y-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
          <div className="h-6 w-48 bg-[var(--color-surface-hover)] rounded" />
          <div className="h-10 w-full bg-[var(--color-surface-hover)] rounded" />
        </div>
      ) : activeMode === 'ENDPOINT' && endpoints.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No MCP Endpoints available"
          description="Create your first MCP endpoint with attached services before running endpoint tests."
          actionLabel="Create Endpoint"
          actionHref="/admin/endpoints"
        />
      ) : activeMode === 'INTEGRATION' && integrations.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No Integrations available"
          description="Connect your first custom REST API or OpenAPI integration to test tools in isolation."
          actionLabel="Add Integration"
          actionHref="/admin/integrations"
        />
      ) : (
        <div className="space-y-6">
          {/* Target & Tool Selection Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[var(--color-surface)] p-5 rounded-2xl border-2 border-[var(--color-border)] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
            {/* Mode B: Endpoint Selector */}
            {activeMode === 'ENDPOINT' ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-[var(--color-text-primary)] font-mono flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>TARGET MCP ENDPOINT:</span>
                  </label>
                  {selectedEndpointData && (
                    <StatusBadge status={selectedEndpointData.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />
                  )}
                </div>
                <select
                  value={selectedEndpointId}
                  onChange={(e) => setSelectedEndpointId(e.target.value)}
                  className="pop-input w-full h-10 px-3 text-xs font-bold font-mono"
                >
                  {endpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name} {!ep.is_active ? '(Paused)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              /* Mode A: Integration Selector */
              <div className="space-y-1.5">
                <label className="text-xs font-black text-[var(--color-text-primary)] font-mono flex items-center gap-1.5">
                  <Boxes className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>TARGET INTEGRATION:</span>
                </label>
                <select
                  value={selectedIntegrationId}
                  onChange={(e) => setSelectedIntegrationId(e.target.value)}
                  className="pop-input w-full h-10 px-3 text-xs font-bold font-mono"
                >
                  {integrations.map((int) => (
                    <option key={int.id} value={int.id}>
                      {int.name} ({int.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Tool Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-[var(--color-text-primary)] font-mono flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>SELECT TOOL:</span>
              </label>
              {loadingTools ? (
                <div className="h-10 w-full bg-[var(--color-surface-hover)] rounded-xl animate-pulse" />
              ) : tools.length === 0 ? (
                <div className="h-10 px-3 flex items-center rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] text-xs text-[var(--color-text-muted)] italic font-medium">
                  {activeMode === 'ENDPOINT'
                    ? 'No service tools attached to this endpoint'
                    : 'No tools configured in this integration'}
                </div>
              ) : (
                <select
                  value={selectedToolId}
                  onChange={(e) => handleToolChange(e.target.value)}
                  className="pop-input w-full h-10 px-3 text-xs font-mono font-black"
                >
                  {tools.map((t) => (
                    <option
                      key={activeMode === 'ENDPOINT' ? t.name : t.id}
                      value={activeMode === 'ENDPOINT' ? t.name : t.id}
                    >
                      {t.name} {t.method ? `[${t.method} ${t.path}]` : `(${t.service_type || 'mcp'})`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Paused Warning if Endpoint Inactive */}
          {isEndpointInactive && (
            <div className="pop-card flex items-center justify-between gap-3 bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-500 p-4 text-xs font-bold text-amber-950 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 stroke-[2.5] shrink-0" />
                <div>
                  <strong>Endpoint is Paused:</strong> This endpoint is disabled and will reject live tool calls.
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="pop-btn text-xs h-7 bg-amber-300 text-slate-950">
                <Link href="/admin/endpoints">Manage Endpoints</Link>
              </Button>
            </div>
          )}

          {/* Mode B: Active Endpoint Connection Metadata Box */}
          {activeMode === 'ENDPOINT' && selectedEndpointData && !isEndpointInactive && (
            <div className="pop-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[var(--color-surface)] px-4 py-2.5 rounded-xl border-2 border-[var(--color-border)] text-xs shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
              <div className="flex items-center gap-3 flex-wrap font-mono font-bold">
                <span>Protocol: <strong className="text-emerald-600 dark:text-emerald-400">Streamable HTTP</strong></span>
                <span className="text-[var(--color-text-muted)]">•</span>
                <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] text-[11px] truncate max-w-md">
                  <span className="text-[var(--color-text-muted)]">URL:</span>
                  <span className="truncate">{currentEndpointUrl}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyUrl}
                className="pop-btn h-7 px-2.5 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-amber-300 gap-1 shrink-0 font-mono font-bold"
              >
                {copiedUrl ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600 stroke-[3]" />
                    <span className="text-emerald-600">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy URL</span>
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Split Pane: Arguments Form & Diagnostics */}
          {selectedTool && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Pane: Tool Info & Parameter Form */}
              <Card className="pop-card border-2 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] flex flex-col justify-between rounded-2xl shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap font-mono">
                      <span className="pop-badge bg-amber-300 text-slate-950">
                        {activeMode === 'ENDPOINT' ? `MCP: ${selectedTool.service_type || 'adapter'}` : `${selectedTool.method || 'GET'} ${selectedTool.path}`}
                      </span>
                      <span className="text-xs font-black text-[var(--color-text-primary)]">{selectedTool.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRawJsonMode(!rawJsonMode)}
                      className="pop-btn h-7 px-2.5 text-xs bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-amber-300 gap-1 font-bold"
                    >
                      <FileJson className="h-3 w-3" />
                      <span>{rawJsonMode ? 'Form View' : 'Raw JSON'}</span>
                    </Button>
                  </div>
                  {selectedTool.description && (
                    <CardDescription className="text-xs font-medium text-[var(--color-text-secondary)] mt-2">
                      {selectedTool.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="p-5 pt-2 flex-1 flex flex-col justify-between space-y-4">
                  {rawJsonMode ? (
                    <div className="space-y-1.5 flex-1">
                      <Label className="text-xs font-bold font-mono text-[var(--color-text-secondary)]">JSON PAYLOAD ARGUMENTS:</Label>
                      <textarea
                        value={rawJsonArgs}
                        onChange={(e) => setRawJsonArgs(e.target.value)}
                        className="pop-input w-full h-48 p-3 font-mono text-xs font-bold focus:outline-none"
                        spellCheck={false}
                      />
                    </div>
                  ) : schemaObj.properties && Object.keys(schemaObj.properties).length > 0 ? (
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-72 pr-1">
                      {Object.entries<any>(schemaObj.properties).map(([key, prop]) => {
                        const isRequired = Array.isArray(schemaObj.required) && schemaObj.required.includes(key);
                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <Label className="text-xs font-mono font-bold text-[var(--color-text-primary)]">
                                {key} {isRequired && <span className="text-rose-500">*</span>}
                              </Label>
                              <span className="text-[10px] text-[var(--color-text-muted)] font-mono font-bold">{prop.type || 'string'}</span>
                            </div>
                            <Input
                              placeholder={prop.description || `Enter ${key}...`}
                              value={formArgs[key] ?? ''}
                              onChange={(e) => handleFormArgChange(key, e.target.value)}
                              className="pop-input h-9 text-xs font-medium"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-[var(--color-border)] p-6 text-center text-xs font-medium text-[var(--color-text-muted)]">
                      This tool does not require parameters. Click Execute to test.
                    </div>
                  )}

                  {/* Action Preview Summary Box */}
                  <div className="rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] p-3 text-[11px] space-y-1 font-mono font-bold text-[var(--color-text-secondary)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                    <div className="flex items-center justify-between">
                      <span>Target: <strong className="text-[var(--color-text-primary)]">{activeMode === 'ENDPOINT' ? selectedEndpointData?.name || 'MCP Endpoint' : 'Custom Integration'}</strong></span>
                      <span className="text-emerald-600 dark:text-emerald-400">✦ P2.3 Secured</span>
                    </div>
                  </div>

                  {/* Execute Button */}
                  <Button
                    onClick={handleExecute}
                    disabled={executing || isEndpointInactive}
                    className="pop-btn w-full bg-amber-400 text-slate-950 hover:bg-amber-300 font-black text-xs h-11 gap-2 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]"
                  >
                    {executing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>EXECUTING {activeMode === 'ENDPOINT' ? 'MCP ENDPOINT' : 'TOOL'}...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-current" />
                        <span>EXECUTE {activeMode === 'ENDPOINT' ? 'MCP ENDPOINT TOOL' : 'INTEGRATION TOOL'} →</span>
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Right Pane: Execution Response & Diagnostics */}
              <Card className="pop-card border-2 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] flex flex-col justify-between rounded-2xl shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-black text-[var(--color-text-primary)] flex items-center gap-2 font-mono">
                      <Terminal className="h-4 w-4 stroke-[2.5]" />
                      <span>Execution Diagnostics</span>
                    </CardTitle>
                    {executionResult && (
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          status={executionResult.success ? 'SUCCESS' : executionResult.status === 429 ? 'RATE_LIMITED' : 'FAILED'}
                          size="sm"
                        />
                        <span className="text-xs font-mono font-bold text-[var(--color-text-muted)]">{executionResult.latencyMs}ms</span>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-2 flex-1 flex flex-col justify-between space-y-4">
                  {executing ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[var(--color-text-secondary)] space-y-3 font-mono font-bold text-xs">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] animate-bounce">
                        <Zap className="h-6 w-6 stroke-[2.5]" />
                      </div>
                      <p>Decrypting credentials server-side and dispatching request...</p>
                    </div>
                  ) : !executionResult ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center text-[var(--color-text-muted)] space-y-3 border-2 border-dashed border-[var(--color-border)] rounded-2xl">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] text-[var(--color-text-muted)]">
                        <Terminal className="h-6 w-6 stroke-[2.5]" />
                      </div>
                      <p className="text-xs font-bold font-mono">Ready to execute. Responses and diagnostics will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 flex-1 flex flex-col">
                      {/* Status Summary Pill Bar */}
                      <div className="flex items-center justify-between rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] px-3 py-2 text-xs">
                        <div className="flex items-center gap-3 font-mono font-bold">
                          <span>
                            Status: <strong className={executionResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{executionResult.status} {executionResult.statusText}</strong>
                          </span>
                          <span className="text-[var(--color-text-muted)]">•</span>
                          <span>Latency: <strong>{executionResult.latencyMs}ms</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopyResult}
                            className="pop-btn h-6 px-2 text-[11px] bg-[var(--color-surface)] text-[var(--color-text-primary)] hover:bg-amber-300 gap-1 font-mono font-bold"
                          >
                            {copiedResponse ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-600 stroke-[3]" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy JSON</span>
                              </>
                            )}
                          </Button>
                          <Link
                            href={`/admin/logs${activeMode === 'ENDPOINT' && selectedEndpointId ? `?endpoint_id=${selectedEndpointId}` : ''}`}
                            className="text-[11px] font-black text-slate-950 dark:text-amber-300 bg-amber-300 dark:bg-amber-950/80 px-2 py-0.5 rounded border border-[var(--color-border)] inline-flex items-center gap-1 font-mono"
                          >
                            <span>Logs →</span>
                          </Link>
                        </div>
                      </div>

                      {/* Response Payload Viewer */}
                      <div className="flex-1 overflow-hidden">
                        <CodeBlock
                          code={JSON.stringify(executionResult.response || { error: executionResult.error }, null, 2)}
                          language="json"
                          title={activeMode === 'ENDPOINT' ? 'CallToolResult' : 'Response Body'}
                          className="max-h-64"
                        />
                      </div>

                      {/* Sanitized Outgoing Headers Preview for Mode A */}
                      {executionResult.sentHeaders && (
                        <div className="pt-2 border-t-2 border-black/5 dark:border-white/5 text-[11px]">
                          <span className="text-[var(--color-text-muted)] font-mono font-bold">Outgoing Headers (Credentials Redacted):</span>
                          <div className="mt-1 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] p-2 font-mono text-[var(--color-text-secondary)] max-h-24 overflow-y-auto font-bold">
                            {Object.entries(executionResult.sentHeaders).map(([hKey, hVal]) => (
                              <div key={hKey} className="truncate">
                                <span className="text-[var(--color-text-muted)]">{hKey}:</span> <span className="text-violet-600 dark:text-violet-400">{String(hVal)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function PlaygroundPage() {
  return (
    <React.Suspense
      fallback={
        <AppShell>
          <div className="h-64 rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-6 animate-pulse space-y-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
            <div className="h-6 w-48 bg-[var(--color-surface-hover)] rounded" />
            <div className="h-10 w-full bg-[var(--color-surface-hover)] rounded" />
          </div>
        </AppShell>
      }
    >
      <PlaygroundContent />
    </React.Suspense>
  );
}