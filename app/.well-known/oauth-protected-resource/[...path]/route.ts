// app/.well-known/oauth-protected-resource/[...path]/route.ts
import { NextResponse } from 'next/server';
import { createProtectedResourceMetadata, extractResourceTarget } from '@/lib/oauth/config';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: { path: string[] } }
) {
  const origin = req.headers.get('origin') || req.headers.get('host');
  const pathParts = params.path || [];
  const fullPath = pathParts.join('/');

  // Extract target ID and type (combo vs endpoint)
  let targetId: string | undefined;
  let isCombo = false;

  const targetInfo = extractResourceTarget(fullPath);
  if (targetInfo) {
    targetId = targetInfo.id;
    isCombo = targetInfo.type === 'combo';
  } else {
    const comboIdx = pathParts.indexOf('combo');
    const mcpIdx = pathParts.indexOf('mcp');
    if (comboIdx !== -1 && pathParts[comboIdx + 1]) {
      targetId = pathParts[comboIdx + 1];
      isCombo = true;
    } else if (mcpIdx !== -1 && pathParts[mcpIdx + 1] && pathParts[mcpIdx + 1] !== 'combo') {
      targetId = pathParts[mcpIdx + 1];
      isCombo = false;
    } else if (pathParts.length > 0) {
      targetId = pathParts[pathParts.length - 1];
    }
  }

  const metadata = createProtectedResourceMetadata(targetId, origin, { isCombo });

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
