// app/api/playground/data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const integrationId = searchParams.get('integrationId');

    // Jika me-request tool berdasarkan integrationId
    if (integrationId) {
      // First ensure the user owns the integration
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId, user_id: user.id }
      });

      if (!integration) {
        return NextResponse.json({ tools: [] });
      }

      const tools = await prisma.integrationTool.findMany({
        where: { integration_id: integrationId },
        orderBy: { name: 'asc' },
      });
      return NextResponse.json({ tools: tools || [] });
    }

    // Jika me-request daftar semua integrasi
    const integrations = await prisma.integration.findMany({
      where: { user_id: user.id },
      select: {
        id: true,
        user_id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        category: true,
        base_url: true,
        auth_type: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        // specifically excluding auth_config
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ integrations: integrations || [] });

  } catch (error: any) {
    console.error('Playground Data Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}