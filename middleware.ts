// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from 'next-auth/middleware';

export default withAuth(
  function middleware(request: NextRequest) {
    const response = NextResponse.next();

    // Jika request menuju ke rute /api/:path*, tambahkan Header CORS
    if (request.nextUrl.pathname.startsWith('/api')) {
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, MCP-Protocol-Version, Last-Event-ID, api_key');
      response.headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
    }

    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        
        // Bebaskan akses untuk rute auth NextAuth, halaman login, dan endpoint API publik jika diperlukan
        if (path.startsWith('/api/auth') || path.startsWith('/login')) {
          return true;
        }

        // Untuk rute /api MCP client (misal /api/mcp/... atau /api/endpoints), 
        // Anda bisa sesuaikan apakah butuh token atau dibiarkan publik untuk bot AI.
        // Jika seluruh dashboard admin & API wajib login, cukup pastikan token ada:
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};