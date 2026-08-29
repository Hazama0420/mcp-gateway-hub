// app/oauth/authorize/page.tsx
'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import {
  ShieldCheck,
  Server,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Zap,
  Globe2,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface AuthorizeData {
  client: {
    client_id: string;
    client_name: string;
    logo_uri?: string;
    client_uri?: string;
  };
  endpoint?: {
    id: string;
    name: string;
    is_active: boolean;
  };
  scope: string;
}

function AuthorizeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  const [loadingData, setLoadingData] = React.useState(true);
  const [authData, setAuthData] = React.useState<AuthorizeData | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [processing, setProcessing] = React.useState(false);

  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method') || 'S256';
  const scope = searchParams.get('scope') || 'mcp:read mcp:write';
  const state = searchParams.get('state') || '';
  const resource = searchParams.get('resource') || '';
  const endpointId = searchParams.get('endpoint_id') || '';

  // 1. Fetch authorization context
  React.useEffect(() => {
    if (!clientId) {
      setErrorMsg('Missing required client_id parameter.');
      setLoadingData(false);
      return;
    }

    const fetchAuthData = async () => {
      try {
        const query = new URLSearchParams({
          client_id: clientId,
          ...(redirectUri ? { redirect_uri: redirectUri } : {}),
          ...(scope ? { scope } : {}),
          ...(resource ? { resource } : {}),
          ...(endpointId ? { endpoint_id: endpointId } : {}),
        });

        const res = await fetch(`/api/oauth/authorize?${query.toString()}`);
        const data = await res.json();

        if (!res.ok) {
          setErrorMsg(data.error_description || data.error || 'Failed to validate authorization request.');
        } else {
          setAuthData(data);
        }
      } catch (err: any) {
        setErrorMsg('Network error while validating authorization request.');
      } finally {
        setLoadingData(false);
      }
    };

    fetchAuthData();
  }, [clientId, redirectUri, scope, resource, endpointId]);

  const handleDecision = async (action: 'allow' | 'deny') => {
    setProcessing(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: responseType,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          scope,
          state,
          resource,
          endpoint_id: authData?.endpoint?.id || endpointId,
          action,
        }),
      });

      const data = await res.json();

      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        setErrorMsg(data.error_description || data.error || 'Authorization failed.');
        setProcessing(false);
      }
    } catch (err: any) {
      setErrorMsg('Failed to complete authorization.');
      setProcessing(false);
    }
  };

  // If not signed in, show sign-in prompt
  if (status === 'unauthenticated') {
    const fullCurrentUrl = typeof window !== 'undefined' ? window.location.href : '';
    return (
      <div className="relative min-h-screen bg-polkadot text-[var(--color-text-primary)] flex flex-col items-center justify-center px-4 overflow-hidden">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>
        <div className="relative z-10 w-full max-w-md pop-card bg-[var(--color-surface)] border-2 border-[var(--color-border)] p-6 sm:p-8 rounded-2xl shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] space-y-6 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
            <Lock className="h-7 w-7 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-black font-mono">Sign In to Continue</h1>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1 font-medium">
              You must be signed in to MCP Gateway Hub to authorize third-party connections like Gemini Spark.
            </p>
          </div>
          <Button
            onClick={() => signIn(undefined, { callbackUrl: fullCurrentUrl })}
            className="pop-btn w-full bg-amber-400 text-slate-950 hover:bg-amber-300 font-black py-2.5 text-xs shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
          >
            Sign In with Account →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-polkadot text-[var(--color-text-primary)] flex flex-col items-center justify-center px-4 overflow-hidden">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-lg pop-card bg-[var(--color-surface)] border-2 border-[var(--color-border)] p-6 sm:p-8 rounded-2xl shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] mb-1">
            <Server className="h-7 w-7 stroke-[2.5]" />
          </div>
          <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-black">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 stroke-[2.5]" />
            <span>MCP OAUTH 2.1 AUTHORIZATION</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)] font-mono">
            Authorize AI Client
          </h1>
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            A client application is requesting permission to access your Model Context Protocol gateway.
          </p>
        </div>

        {errorMsg && (
          <div className="bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-500 text-rose-700 dark:text-rose-200 text-xs px-4 py-2.5 rounded-xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loadingData ? (
          <div className="py-8 text-center font-mono text-xs font-bold animate-pulse text-[var(--color-text-muted)]">
            Loading authorization details...
          </div>
        ) : authData ? (
          <div className="space-y-4">
            {/* Requesting Client Box */}
            <div className="p-4 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
              <div className="text-[10px] font-mono font-black text-[var(--color-text-muted)] uppercase">
                Requesting Client:
              </div>
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-amber-500 stroke-[2.5]" />
                <span className="font-black text-sm font-mono text-[var(--color-text-primary)]">
                  {authData.client.client_name}
                </span>
              </div>
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] truncate">
                Client ID: {authData.client.client_id}
              </div>
            </div>

            {/* Target Endpoint Box */}
            <div className="p-4 rounded-xl bg-[var(--color-surface-elevated)] border-2 border-[var(--color-border)] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
              <div className="text-[10px] font-mono font-black text-[var(--color-text-muted)] uppercase">
                Target MCP Endpoint:
              </div>
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-sky-500 stroke-[2.5]" />
                <span className="font-black text-sm font-mono text-[var(--color-text-primary)]">
                  {authData.endpoint?.name || 'All Assigned MCP Tools'}
                </span>
              </div>
              {authData.endpoint?.id && (
                <div className="text-[10px] font-mono text-[var(--color-text-muted)] truncate">
                  Endpoint ID: {authData.endpoint.id}
                </div>
              )}
            </div>

            {/* Permissions / Scopes List */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono font-black text-[var(--color-text-muted)] uppercase">
                Requested Permissions:
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)]">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 stroke-[2.5] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[var(--color-text-primary)]">mcp:read</strong>
                    <p className="text-[10px] text-[var(--color-text-secondary)]">
                      List available tools, schemas, and gateway capabilities.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)]">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 stroke-[2.5] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[var(--color-text-primary)]">mcp:write</strong>
                    <p className="text-[10px] text-[var(--color-text-secondary)]">
                      Execute MCP tools on configured backend services (GitHub, Postgres, Vercel).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* User identity confirmation */}
            <div className="text-[11px] text-center text-[var(--color-text-muted)] font-medium">
              Signed in as <strong className="text-[var(--color-text-primary)]">{session?.user?.email}</strong>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                variant="outline"
                disabled={processing}
                onClick={() => handleDecision('deny')}
                className="pop-btn py-2.5 text-xs font-bold border-2 border-[var(--color-border)] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                Deny Access
              </Button>
              <Button
                disabled={processing}
                onClick={() => handleDecision('allow')}
                className="pop-btn bg-amber-400 text-slate-950 hover:bg-amber-300 font-black py-2.5 text-xs shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]"
              >
                {processing ? 'Authorizing...' : 'Allow Access →'}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-polkadot flex items-center justify-center font-mono text-xs font-bold text-[var(--color-text-muted)]">
          Loading Authorization...
        </div>
      }
    >
      <AuthorizeContent />
    </React.Suspense>
  );
}
