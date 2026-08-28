// components/AppShell.tsx
'use client';

import * as React from 'react';
import { AppNavigation, MobileNavigation } from '@/components/AppNavigation';
import { DashboardHeader } from '@/components/DashboardHeader';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] font-sans transition-colors duration-200">
      {/* Desktop Sidebar */}
      <AppNavigation />

      {/* Main Content Area with Flagship Polkadot Pattern */}
      <div className="flex flex-1 flex-col min-w-0 bg-polkadot">
        <MobileNavigation />
        <DashboardHeader />
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
