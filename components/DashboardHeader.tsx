// components/DashboardHeader.tsx
'use client';

import { useSession, signOut, signIn } from 'next-auth/react';
import { LogOut, LogIn, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DashboardHeader() {
  const { data: session, status } = useSession();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-white/[0.06] bg-[#060b10]/80 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {/* Placeholder jika ingin menambah breadcrumb atau info halaman di kiri */}
        <span className="text-xs font-medium text-slate-400">
          MCP Gateway Control Center
        </span>
      </div>

      <div className="flex items-center gap-4">
        {status === 'loading' ? (
          <div className="h-8 w-24 animate-pulse rounded-xl bg-white/[0.05]" />
        ) : session?.user ? (
          <div className="flex items-center gap-3">
            {/* Info User */}
            <div className="hidden items-center gap-2.5 sm:flex">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="h-8 w-8 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                  <UserIcon className="h-4 w-4" />
                </div>
              )}
              <div className="text-left">
                <p className="text-xs font-medium text-white">
                  {session.user.name || 'Admin'}
                </p>
                <p className="text-[10px] text-slate-500">
                  {session.user.email}
                </p>
              </div>
            </div>

            {/* Tombol Logout */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-2 rounded-xl border-white/10 bg-white/[0.03] text-slate-300 hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-400 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Keluar</span>
            </Button>
          </div>
        ) : (
          /* Tombol Login (jika diakses tanpa middleware/publik) */
          <Button
            size="sm"
            onClick={() => signIn()}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 text-slate-950 font-medium hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/10"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Masuk</span>
          </Button>
        )}
      </div>
    </header>
  );
}