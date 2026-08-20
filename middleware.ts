import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // CORS untuk API
  response.headers.set(
    'Access-Control-Allow-Origin',
    '*'
  );

  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS'
  );

  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, Authorization, MCP-Protocol-Version, Last-Event-ID'
  );

  response.headers.set(
    'Access-Control-Expose-Headers',
    'Mcp-Session-Id, WWW-Authenticate'
  );

  return response;
}

export const config = {
  matcher: '/api/:path*',
};