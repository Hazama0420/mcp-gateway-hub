// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from 'next-auth/middleware';

export default withAuth(
  function middleware(request: NextRequest) {
    const response = NextResponse.next();

    // Tambahkan Header CORS secara universal untuk semua rute /api
    if (request.nextUrl.pathname.startsWith('/api')) {
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, MCP-Protocol-Version, Last-Event-ID, api_key, mcp-session-id');
      response.headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
    }

    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        
        // Izinkan method OPTIONS (CORS preflight) agar tidak tertahan otentikasi
        if (req.method === 'OPTIONS') {
          return true;
        }

        // Bebaskan akses untuk rute auth, halaman login, dan SELURUH rute /api/mcp/
        if (
          path.startsWith('/api/auth') || 
          path.startsWith('/login') || 
          path.startsWith('/api/mcp/')
        ) {
          return true;
        }

        // Rute dashboard/admin lainnya wajib memiliki token login
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    // Jangan ubah matcher ini agar middleware tetap memantau rute API & halaman yang perlu dilindungi
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};