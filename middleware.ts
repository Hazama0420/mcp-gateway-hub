// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Tambahkan CORS headers untuk semua API routes
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Expose-Headers', 'Content-Type');

  // Untuk SSE, pastikan Content-Type tetap text/event-stream
  if (request.nextUrl.pathname.startsWith('/api/mcp/')) {
    response.headers.set('Content-Type', 'text/event-stream');
    response.headers.set('Cache-Control', 'no-cache');
    response.headers.set('Connection', 'keep-alive');
  }

  return response;
}

// Hanya jalankan middleware untuk API routes
export const config = {
  matcher: '/api/:path*',
};