import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import {
  isOriginAllowed,
  getBrowserCorsHeaders,
  getMcpCorsHeaders,
  applyCorsHeaders,
} from '@/lib/security/cors';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const origin = request.headers.get('origin');
  const isMcpRoute = path.startsWith('/api/mcp/');

  // 1. Tangani preflight OPTIONS
  if (request.method === 'OPTIONS') {
    if (isMcpRoute) {
      const mcpHeaders = getMcpCorsHeaders(origin);
      return new NextResponse(null, { status: 204, headers: mcpHeaders });
    }

    if (path.startsWith('/api/')) {
      if (origin && isOriginAllowed(origin)) {
        const browserHeaders = getBrowserCorsHeaders(origin);
        return new NextResponse(null, { status: 204, headers: browserHeaders });
      }
      // Origin tidak diizinkan atau tidak ada: return 204 tanpa CORS headers
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.next();
  }

  // 2. Siapkan response
  const response = NextResponse.next();

  // Tambahkan CORS headers yang sesuai
  if (isMcpRoute) {
    if (origin) {
      applyCorsHeaders(response, getMcpCorsHeaders(origin));
    }
    // Bebaskan seluruh rute MCP dari cek login dashboard
    return response;
  }

  if (path.startsWith('/api/')) {
    if (origin && isOriginAllowed(origin)) {
      applyCorsHeaders(response, getBrowserCorsHeaders(origin));
    }
  }

  // 3. Bebaskan rute publik (auth, login, health, discovery, OAuth 2.1)
  if (
    path.startsWith('/api/auth') || 
    path.startsWith('/login') ||
    path.startsWith('/api/health') ||
    path.startsWith('/.well-known') ||
    path.startsWith('/oauth') ||
    path.startsWith('/authorize') ||
    path.startsWith('/register') ||
    path.startsWith('/token') ||
    path.startsWith('/revoke') ||
    path.startsWith('/api/oauth')
  ) {
    return response;
  }

  // 4. Cek token untuk rute dashboard lainnya menggunakan NextAuth getToken (aman untuk Edge)
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token && path.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};