// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const response = NextResponse.next();

  // 1. Tambahkan Header CORS untuk semua rute /api
  if (path.startsWith('/api')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, MCP-Protocol-Version, Last-Event-ID, api_key, mcp-session-id');
    response.headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
  }

  // 2. Izinkan preflight OPTIONS agar lolos tanpa cek login
  if (request.method === 'OPTIONS') {
    return response;
  }

  // 3. Bebaskan rute publik (auth, login, dan SELURUH rute MCP)
  if (
    path.startsWith('/api/auth') || 
    path.startsWith('/login') || 
    path.startsWith('/api/mcp/')
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