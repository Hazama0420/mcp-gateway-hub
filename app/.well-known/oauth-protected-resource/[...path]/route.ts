// app/.well-known/oauth-protected-resource/[...path]/route.ts
import { NextResponse } from 'next/server';
import { createProtectedResourceMetadata } from '@/lib/oauth/config';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: { path: string[] } }
) {
  const origin = req.headers.get('origin') || req.headers.get('host');
  const pathParts = params.path || [];

  // Extract endpoint ID if path format is api/mcp/[id]/http or similar
  let endpointId: string | undefined;
  const mcpIdx = pathParts.indexOf('mcp');
  if (mcpIdx !== -1 && pathParts[mcpIdx + 1]) {
    endpointId = pathParts[mcpIdx + 1];
  } else if (pathParts.length > 0) {
    endpointId = pathParts[pathParts.length - 1];
  }

  const metadata = createProtectedResourceMetadata(endpointId, origin);

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
