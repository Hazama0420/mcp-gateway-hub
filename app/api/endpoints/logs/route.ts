// app/api/endpoints/logs/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const logs = await prisma.executionLog.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        endpoint: {
          select: { name: true }
        }
      }
    });
    
    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('Fetch Logs Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}