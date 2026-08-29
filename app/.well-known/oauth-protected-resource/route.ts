// app/.well-known/oauth-protected-resource/route.ts
import { NextResponse } from 'next/server';
import { createProtectedResourceMetadata } from '@/lib/oauth/config';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const origin = req.headers.get('origin') || req.headers.get('host');
  const metadata = createProtectedResourceMetadata(undefined, origin);

  return NextResponse.json(metadata, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
