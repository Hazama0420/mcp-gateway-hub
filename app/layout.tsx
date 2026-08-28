// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'MCP Gateway Hub — Developer Security Console',
  description: 'Enterprise MCP Gateway Hub & Realtime Multi-tenant Security Console',
};

const themeScript = `
  (function() {
    try {
      var stored = localStorage.getItem('mcp_theme');
      if (stored === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      }
    } catch(e) {
      document.documentElement.classList.add('light');
    }
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] font-sans antialiased transition-colors duration-200 selection:bg-amber-400 selection:text-slate-950">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}