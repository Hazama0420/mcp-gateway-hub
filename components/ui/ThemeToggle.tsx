// components/ui/ThemeToggle.tsx
'use client';

import * as React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'default';
}

export function ThemeToggle({ className = '', size = 'sm' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className={`pop-btn relative inline-flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-pop-yellow)] ${
        size === 'sm' ? 'h-8 w-8 px-0' : 'h-9 w-9 px-0'
      } ${className}`}
    >
      <span className="sr-only">Toggle theme</span>
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400 stroke-[2.5] transition-transform duration-200 hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 text-indigo-600 stroke-[2.5] transition-transform duration-200 hover:-rotate-12" />
      )}
    </Button>
  );
}
