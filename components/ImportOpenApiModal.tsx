// components/ImportOpenApiModal.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Globe2, Loader2, Sparkles, Check } from 'lucide-react';

interface ImportOpenApiModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess: (data: {
    name: string;
    slug: string;
    description: string;
    baseUrl: string;
    authType: string;
    tools: any[];
  }) => void;
}

export function ImportOpenApiModal({ open, onOpenChange, onImportSuccess }: ImportOpenApiModalProps) {
  const [url, setUrl] = useState('');
  const [rawSpec, setRawSpec] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [selectedTools, setSelectedTools] = useState<Set<number>>(new Set());

  const handleFetchSpec = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/import-openapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() || undefined, rawSpec: rawSpec.trim() || undefined }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mem-parsing OpenAPI');

      setPreviewData(data);
      // Default: pilih semua tools
      setSelectedTools(new Set(data.tools.map((_: any, idx: number) => idx)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyImport = () => {
    if (!previewData) return;
    const filteredTools = previewData.tools.filter((_: any, idx: number) => selectedTools.has(idx));
    onImportSuccess({
      ...previewData,
      tools: filteredTools,
    });
    onOpenChange(false);
    setPreviewData(null);
    setUrl('');
    setRawSpec('');
  };

  const toggleTool = (idx: number) => {
    const next = new Set(selectedTools);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedTools(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-hidden flex flex-col bg-[#0a1016] border-white/[0.08] text-white">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <Sparkles className="h-4 w-4" /> 1-Click Importer
          </div>
          <DialogTitle className="text-xl">Import Swagger / OpenAPI</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {!previewData ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">OpenAPI / Swagger JSON URL</Label>
              <div className="flex gap-2">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://petstore.swagger.io/v2/swagger.json"
                  className="bg-black/30 border-white/[0.08] font-mono text-xs text-slate-200"
                />
                <Button
                  onClick={handleFetchSpec}
                  disabled={loading || (!url.trim() && !rawSpec.trim())}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                  Fetch
                </Button>
              </div>
            </div>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/[0.06]" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#0a1016] px-2 text-slate-600">or paste JSON schema</span></div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Raw OpenAPI JSON</Label>
              <textarea
                value={rawSpec}
                onChange={(e) => setRawSpec(e.target.value)}
                placeholder='{"openapi": "3.0.0", "info": { ... }, "paths": { ... }}'
                className="w-full min-h-[140px] rounded-xl border border-white/[0.08] bg-black/30 p-3 font-mono text-xs text-slate-300 outline-none focus:border-emerald-500/40"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2 flex-1 min-h-0 flex flex-col">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">{previewData.name}</span>
                <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                  {previewData.tools.length} Tools Discovered
                </Badge>
              </div>
              <p className="text-xs text-slate-500 truncate"><Globe2 className="inline h-3 w-3 mr-1" /> {previewData.baseUrl || 'No base URL specified'}</p>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>Pilih tools yang ingin di-import ({selectedTools.size} dipilih):</span>
              <button
                type="button"
                onClick={() => setSelectedTools(new Set(previewData.tools.map((_: any, idx: number) => idx)))}
                className="text-emerald-400 hover:underline"
              >
                Pilih Semua
              </button>
            </div>

            <ScrollArea className="flex-1 max-h-[260px] pr-2">
              <div className="space-y-2">
                {previewData.tools.map((tool: any, idx: number) => {
                  const isChecked = selectedTools.has(idx);
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleTool(idx)}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        isChecked ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/[0.06] bg-black/20 opacity-60'
                      }`}
                    >
                      <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isChecked ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-white/20'}`}>
                        {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-white">{tool.name}</span>
                          <Badge variant="outline" className="text-[10px] py-0 border-white/[0.08] text-slate-400">{tool.method}</Badge>
                        </div>
                        <p className="font-mono text-[11px] text-slate-500 truncate mt-0.5">{tool.path}</p>
                        {tool.description && <p className="text-xs text-slate-400 line-clamp-1 mt-1">{tool.description}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          {previewData && (
            <Button variant="ghost" onClick={() => setPreviewData(null)} className="text-slate-400 hover:text-white">
              Back
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/[0.08] bg-white/[0.03] text-slate-300">
            Cancel
          </Button>
          {previewData && (
            <Button onClick={handleApplyImport} disabled={selectedTools.size === 0} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium">
              Import {selectedTools.size} Tools to Builder
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}