// app/admin/playground/page.tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Play,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Wrench,
  RotateCcw
} from 'lucide-react';

export default function ToolPlaygroundPage() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>('');
  const [selectedToolId, setSelectedToolId] = useState<string>('');
  const [selectedTool, setSelectedTool] = useState<any>(null);

  const [formArgs, setFormArgs] = useState<Record<string, any>>({});
  const [rawJsonMode, setRawJsonMode] = useState<boolean>(false);
  const [rawJsonArgs, setRawJsonArgs] = useState<string>('{}');

  const [executing, setExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);

  useEffect(() => {
    fetchIntegrations();
  }, []);

  async function fetchIntegrations() {
    try {
      const res = await fetch('/api/playground/data');
      const data = await res.json();
      if (data.integrations && data.integrations.length > 0) {
        setIntegrations(data.integrations);
        setSelectedIntegrationId(data.integrations[0].id);
      }
    } catch (e) {
      console.error('Gagal mengambil integrasi:', e);
    }
  }

  useEffect(() => {
    if (!selectedIntegrationId) return;
    fetchTools(selectedIntegrationId);
  }, [selectedIntegrationId]);

  async function fetchTools(integrationId: string) {
    try {
      const res = await fetch(`/api/playground/data?integrationId=${integrationId}`);
      const data = await res.json();
      const toolList = data.tools || [];
      
      setTools(toolList);
      
      if (toolList.length > 0) {
        const firstTool = toolList[0];
        setSelectedToolId(firstTool.id);
        setSelectedTool(firstTool);
        initializeArgs(firstTool);
      } else {
        setSelectedToolId('');
        setSelectedTool(null);
        setFormArgs({});
        setRawJsonArgs('{}');
      }
    } catch (e) {
      console.error('Gagal mengambil tools:', e);
    }
  }

  function handleToolChange(toolId: string) {
    setSelectedToolId(toolId);
    const tool = tools.find((t) => t.id === toolId);
    setSelectedTool(tool);
    initializeArgs(tool);
    setExecutionResult(null);
  }

  function initializeArgs(tool: any) {
    if (!tool) return;
    let schema: any = {};
    try {
      schema = typeof tool.input_schema === 'string'
        ? JSON.parse(tool.input_schema)
        : (tool.input_schema || {});
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

  async function handleExecute() {
    if (!selectedToolId) return;
    setExecuting(true);
    setExecutionResult(null);

    let payloadArgs = formArgs;
    if (rawJsonMode) {
      try {
        payloadArgs = JSON.parse(rawJsonArgs);
      } catch (e: any) {
        alert('JSON Raw tidak valid: ' + e.message);
        setExecuting(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/playground/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolId: selectedToolId,
          args: payloadArgs,
        }),
      });

      const data = await res.json();
      setExecutionResult(data);
    } catch (err: any) {
      setExecutionResult({
        success: false,
        status: 500,
        statusText: 'Network / Client Error',
        error: err.message,
      });
    } finally {
      setExecuting(false);
    }
  }

  let parsedSchema: any = {};
  try {
    parsedSchema = selectedTool?.input_schema
      ? (typeof selectedTool.input_schema === 'string'
          ? JSON.parse(selectedTool.input_schema)
          : selectedTool.input_schema)
      : {};
  } catch {
    parsedSchema = {};
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-white">
              <Terminal className="w-7 h-7 text-indigo-400" />
              In-App Tool Playground
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Uji coba eksekusi REST tool secara instan sebelum dipanggil oleh Gemini Spark (Powered by Neon)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExecute}
              disabled={executing || !selectedToolId}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium px-5 py-2.5 rounded-lg transition shadow-lg shadow-indigo-600/20 cursor-pointer disabled:cursor-not-allowed"
            >
              {executing ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Run Request
                </>
              )}
            </button>
          </div>
        </div>

        {/* Top Controls: Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-indigo-400" /> Pilih Integrasi
            </label>
            <select
              value={selectedIntegrationId}
              onChange={(e) => setSelectedIntegrationId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {integrations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.base_url || item.baseUrl})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-2">
              <Wrench className="w-4 h-4 text-emerald-400" /> Pilih Action Tool
            </label>
            <select
              value={selectedToolId}
              onChange={(e) => handleToolChange(e.target.value)}
              disabled={tools.length === 0}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              {tools.length === 0 ? (
                <option value="">Tidak ada tool terdaftar</option>
              ) : (
                tools.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.method}] {t.name} - {t.path}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Parameters */}
          <div className="lg:col-span-5 bg-slate-900/60 rounded-xl border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-sm font-semibold text-slate-200">Input Parameters</span>
              <button
                type="button"
                onClick={() => setRawJsonMode(!rawJsonMode)}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition"
              >
                {rawJsonMode ? 'Switch to Form Builder' : 'Edit as Raw JSON'}
              </button>
            </div>

            {selectedTool && (
              <div className="text-xs text-slate-400 bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 space-y-1">
                <p><strong className="text-slate-300">Method:</strong> <span className="text-amber-400 font-mono">{selectedTool.method}</span></p>
                <p><strong className="text-slate-300">Path:</strong> <span className="text-sky-400 font-mono">{selectedTool.path}</span></p>
                {selectedTool.description && (
                  <p className="text-slate-400 pt-1 italic">{selectedTool.description}</p>
                )}
              </div>
            )}

            {rawJsonMode ? (
              <div>
                <textarea
                  rows={12}
                  value={rawJsonArgs}
                  onChange={(e) => setRawJsonArgs(e.target.value)}
                  className="w-full font-mono text-xs bg-slate-950 border border-slate-800 rounded-lg p-3 text-emerald-400 focus:outline-none focus:border-indigo-500"
                  placeholder="{}"
                />
              </div>
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {parsedSchema?.properties && Object.keys(parsedSchema.properties).length > 0 ? (
                  Object.entries<any>(parsedSchema.properties).map(([key, prop]) => {
                    const isRequired = Array.isArray(parsedSchema.required) && parsedSchema.required.includes(key);
                    return (
                      <div key={key} className="space-y-1">
                        <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                          <span>
                            {key} {isRequired && <span className="text-red-400">*</span>}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">{prop.type || 'string'}</span>
                        </label>
                        <input
                          type={prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text'}
                          value={formArgs[key] !== undefined ? formArgs[key] : ''}
                          placeholder={prop.description || `Masukkan ${key}...`}
                          onChange={(e) =>
                            setFormArgs({
                              ...formArgs,
                              [key]: prop.type === 'number' || prop.type === 'integer' ? Number(e.target.value) : e.target.value,
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-xs text-slate-500">
                    Tool ini tidak membutuhkan parameter input tambahan.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Response Inspector */}
          <div className="lg:col-span-7 bg-slate-900/60 rounded-xl border border-slate-800 p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-sm font-semibold text-slate-200">Execution Output</span>
                {executionResult && (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-medium flex items-center gap-1 ${
                      executionResult.success || (executionResult.status >= 200 && executionResult.status < 300)
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {executionResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      HTTP {executionResult.status} {executionResult.statusText}
                    </span>

                    <span className="text-xs px-2.5 py-1 rounded-full font-mono bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {executionResult.latencyMs} ms
                    </span>
                  </div>
                )}
              </div>

              {executionResult?.targetUrl && (
                <div className="text-xs font-mono text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 break-all">
                  <span className="text-amber-400 font-bold mr-2">[{executionResult.method}]</span>
                  {executionResult.targetUrl}
                </div>
              )}

              <div className="relative">
                <pre className="w-full h-[400px] overflow-auto bg-slate-950 rounded-lg p-4 font-mono text-xs text-emerald-400 border border-slate-800 leading-relaxed">
                  {executionResult
                    ? JSON.stringify(executionResult.response || executionResult, null, 2)
                    : '// Tekan tombol "Run Request" untuk melihat hasil response...'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}