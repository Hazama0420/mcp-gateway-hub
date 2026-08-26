// components/AppNavigation.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  LayoutDashboard,
  Server,
  Activity,
} from 'lucide-react';

const navigation = [
  {
    href: '/',
    label: 'Dasbor',
    icon: LayoutDashboard,
  },
  {
    href: '/admin/integrations',
    label: 'Integrasi',
    icon: Boxes,
  },
  {
    href: '/admin/logs',
    label: 'Log Aktivitas',
    icon: Activity,
  },
];

export function AppNavigation() {
  const pathname = usePathname() || '';

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r border-white/[0.06] bg-[#080e14] lg:block">
      <div className="sticky top-0 flex h-screen flex-col">
        <div className="border-b border-white/[0.06] px-6 py-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Server className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-white">MCP Gateway</p>
              <p className="text-[11px] text-slate-600">Pusat Gateway Hub</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
            Ruang Kerja
          </p>

          {navigation.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                    : 'text-slate-500 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] p-4">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
              <span className="text-xs font-medium text-emerald-400">Gateway Aktif</span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              Layanan MCP siap digunakan oleh klien AI yang terhubung.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileNavigation() {
  const pathname = usePathname() || '';

  return (
    <nav className="flex border-b border-white/[0.06] bg-[#080e14] lg:hidden">
      {navigation.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-xs transition ${
              active
                ? 'border-b-2 border-emerald-400 text-emerald-400 font-medium bg-emerald-500/5'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}