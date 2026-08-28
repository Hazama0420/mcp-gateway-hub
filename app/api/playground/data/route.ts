// app/api/playground/data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getEndpointTools } from '@/lib/mcpServer';

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
    const endpointId = searchParams.get('endpointId');

    // 1. If requesting tools for a specific integration (Mode A)
    if (integrationId) {
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

    // 2. If requesting tools for a specific MCP Endpoint (Mode B)
    if (endpointId) {
      const endpoint = await prisma.mcpEndpoint.findFirst({
        where: { id: endpointId, user_id: user.id },
        include: { services: true },
      });

      if (!endpoint) {
        return NextResponse.json({ error: 'Endpoint not found or unauthorized' }, { status: 404 });
      }

      const tools = await getEndpointTools(endpoint);
      return NextResponse.json({
        endpoint: {
          id: endpoint.id,
          name: endpoint.name,
          is_active: endpoint.is_active,
          created_at: endpoint.created_at,
          services: endpoint.services.map((s) => ({
            id: s.id,
            service_type: s.service_type,
          })),
        },
        tools: tools || [],
      });
    }

    // 3. Default: Return both integrations and endpoints for target selectors
    const [integrations, endpoints] = await Promise.all([
      prisma.integration.findMany({
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
        },
        orderBy: { name: 'asc' },
      }),
      prisma.mcpEndpoint.findMany({
        where: { user_id: user.id },
        select: {
          id: true,
          user_id: true,
          name: true,
          is_active: true,
          created_at: true,
          services: {
            select: {
              id: true,
              service_type: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    return NextResponse.json({
      integrations: integrations || [],
      endpoints: endpoints || [],
    });

  } catch (error: any) {
    console.error('Playground Data Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}