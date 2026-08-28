// app/login/page.tsx
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Server, Lock, Mail, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await signIn('credentials', {
        redirect: false,
        email,
        password,
      });

      if (res?.error) {
        setError('Invalid email or password.');
        setLoading(false);
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      setError('An error occurred during authentication.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-polkadot text-[var(--color-text-primary)] flex flex-col items-center justify-center px-4 overflow-hidden transition-colors duration-200">
      {/* Top Bar with Theme Toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md pop-card bg-[var(--color-surface)] border-2 border-[var(--color-border)] p-6 sm:p-8 rounded-2xl shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 border-2 border-[var(--color-border)] shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] mb-1">
            <Server className="h-7 w-7 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-black">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 stroke-[2.5]" />
              <span>DEVELOPER GATEWAY AUTH</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)] font-mono mt-1">
              MCP Gateway Hub
            </h1>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mt-0.5">
              Sign in to manage and test your MCP endpoints & tool gateways
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-500 text-rose-700 dark:text-rose-200 text-xs px-4 py-2.5 rounded-xl text-center font-bold">
            {error}
          </div>
        )}

        {/* OAuth Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="pop-btn py-2 px-3 bg-[var(--color-surface-elevated)] hover:bg-[var(--color-pop-yellow)] text-xs font-black text-[var(--color-text-primary)] gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.8 7.3l3.7 2.9C6.4 7.2 9 5 12 5z"/>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
              <path fill="#FBBC05" d="M5.5 14.8c-.2-.7-.3-1.4-.3-2.2s.1-1.5.3-2.2L1.8 7.5C.7 9.7 0 12.1 0 14.8s.7 5.1 1.8 7.3l3.7-2.9z"/>
              <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.6-2.2-6.5-5.2L1.8 16c1.9 3.7 5.7 7 10.2 7z"/>
            </svg>
            <span>Google</span>
          </button>

          <button
            type="button"
            onClick={() => signIn('github', { callbackUrl: '/' })}
            className="pop-btn py-2 px-3 bg-[var(--color-surface-elevated)] hover:bg-[var(--color-pop-yellow)] text-xs font-black text-[var(--color-text-primary)] gap-2"
          >
            <GithubIcon className="w-4 h-4" />
            <span>GitHub</span>
          </button>
        </div>

        <div className="flex items-center my-3">
          <div className="flex-grow border-t-2 border-[var(--color-border)] opacity-20" />
          <span className="px-3 text-[10px] text-[var(--color-text-muted)] font-mono font-bold uppercase tracking-wider">or email</span>
          <div className="flex-grow border-t-2 border-[var(--color-border)] opacity-20" />
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleCredentialsLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold font-mono text-[var(--color-text-primary)]">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-[var(--color-text-muted)]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@example.com"
                className="pop-input w-full h-10 px-3.5 pl-10 text-xs font-medium"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold font-mono text-[var(--color-text-primary)]">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-[var(--color-text-muted)]" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pop-input w-full h-10 px-3.5 pl-10 text-xs font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="pop-btn w-full bg-amber-400 text-slate-950 hover:bg-amber-300 font-black py-2.5 text-xs gap-2 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] cursor-pointer mt-2"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In to Gateway →'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}