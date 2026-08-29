// app/oauth/revoke/route.ts
import { NextResponse } from 'next/server';
import { revokeOAuthToken } from '@/lib/oauth/store';

export const dynamic = 'force-dynamic';

async function parseRequestBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const result: Record<string, string> = {};
    params.forEach((v, k) => {
      result[k] = v;
    });
    return result;
  }

  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const body = await parseRequestBody(req);
  const token = body.token;

  if (token) {
    await revokeOAuthToken(token);
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
