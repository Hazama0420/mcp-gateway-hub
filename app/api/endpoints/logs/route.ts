// app/api/endpoints/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get('limit')) || 20;
    const logs = await prisma.executionLog.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return NextResponse.json(logs);
  } catch (error: any) {
    console.error('[GET /api/endpoints/logs] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logs', details: error.message },
      { status: 500 }
    );
  }
}