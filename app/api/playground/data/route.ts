// app/api/playground/data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const integrationId = searchParams.get('integrationId');

    // Jika me-request tool berdasarkan integrationId
    if (integrationId) {
      const tools = await prisma.integrationTool.findMany({
        where: { integration_id: integrationId },
        orderBy: { name: 'asc' },
      });
      return NextResponse.json({ tools: tools || [] });
    }

    // Jika me-request daftar semua integrasi
    const integrations = await prisma.integration.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ integrations: integrations || [] });

  } catch (error: any) {
    console.error('Playground Data Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}