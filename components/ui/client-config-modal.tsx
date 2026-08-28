// components/ui/client-config-modal.tsx
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
import { CodeBlock } from '@/components/ui/code-block';
import { Copy, Check, Terminal, ExternalLink, Code2, Sparkles } from 'lucide-react';

interface ClientConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: {
    id: string;
    name: string;
    services?: Array<{ service_type: string }>;
  } | null;
}

export function ClientConfigModal({
  open,
  onOpenChange,
  endpoint,
}: ClientConfigModalProps) {
  const [activeTab, setActiveTab] = React.useState<'claude' | 'cursor'>('claude');
  const [copied, setCopied] = React.useState(false);

  if (!endpoint) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const sseUrl = `${origin}/api/mcp/${endpoint.id}/sse`;
  const httpUrl = `${origin}/api/mcp/${endpoint.id}/http`;

  // Claude Desktop MCP configuration JSON snippet (mcpServers)
  const claudeConfig = {
    mcpServers: {
      [endpoint.name.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'mcp-gateway']: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything', httpUrl],
      },
    },
  };

  // Cursor AI config format
  const cursorConfig = {
    name: endpoint.name,
    type: 'sse',
    url: sseUrl,
  };

  const currentJson =
    activeTab === 'claude'
      ? JSON.stringify(claudeConfig, null, 2)
      : JSON.stringify(cursorConfig, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy configuration:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] rounded-2xl text-[var(--color-text-primary)]">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              <Code2 className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <DialogTitle className="text-base font-black tracking-tight font-mono">
                Connect to AI Client
              </DialogTitle>
              <DialogDescription className="text-xs font-medium text-[var(--color-text-secondary)]">
                Connect <strong className="text-[var(--color-text-primary)] font-bold">{endpoint.name}</strong> to Claude Desktop or Cursor AI.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab Switcher */}
        <div className="flex gap-2 border-b-2 border-[var(--color-border)] pb-2 pt-2">
          <button
            onClick={() => setActiveTab('claude')}
            className={`pop-btn px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'claude'
                ? 'bg-amber-400 text-slate-950 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] shadow-none'
            }`}
          >
            Claude Desktop
          </button>
          <button
            onClick={() => setActiveTab('cursor')}
            className={`pop-btn px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'cursor'
                ? 'bg-amber-400 text-slate-950 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] shadow-none'
            }`}
          >
            Cursor AI
          </button>
        </div>

        <div className="space-y-4 pt-1">
          {activeTab === 'claude' ? (
            <div className="space-y-2 text-xs">
              <p className="text-[var(--color-text-secondary)] font-medium">
                Add this snippet to your <code className="bg-amber-100 dark:bg-amber-900/50 px-1 py-0.5 rounded font-mono font-bold text-slate-900 dark:text-amber-200">claude_desktop_config.json</code>:
              </p>
              <CodeBlock code={currentJson} language="json" title="claude_desktop_config.json" />
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <p className="text-[var(--color-text-secondary)] font-medium">
                In Cursor AI, go to <strong>Settings &gt; Features &gt; MCP</strong> and add a new SSE endpoint with:
              </p>
              <CodeBlock code={currentJson} language="json" title="Cursor MCP Config" />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="pop-btn text-xs font-bold"
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleCopy}
              className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 text-xs font-black gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                  <span>Copied Config</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Configuration</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
