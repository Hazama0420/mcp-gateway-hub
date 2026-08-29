// app/api/endpoints/[id]/oauth-clients/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { listEndpointOAuthClients, createEndpointOAuthClient } from '@/lib/oauth/store';
import { recordSecurityEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const endpointId = params.id;
  const endpoint = await prisma.mcpEndpoint.findFirst({
    where: { id: endpointId, user_id: user.id },
  });

  if (!endpoint) {
    return NextResponse.json({ error: 'Endpoint not found or unauthorized' }, { status: 404 });
  }

  const clients = await listEndpointOAuthClients(endpointId, user.id);
  return NextResponse.json(clients);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const endpointId = params.id;
  const endpoint = await prisma.mcpEndpoint.findFirst({
    where: { id: endpointId, user_id: user.id },
  });

  if (!endpoint) {
    return NextResponse.json({ error: 'Endpoint not found or unauthorized' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { client_name, client_type, redirect_uris, scope } = body;

    const newClient = await createEndpointOAuthClient({
      endpointId,
      userId: user.id,
      clientName: client_name || 'Gemini Spark Client',
      clientType: client_type || 'public',
      redirectUris: redirect_uris,
      scope: scope || 'mcp:read mcp:write',
    });

    recordSecurityEvent({
      eventType: 'OAUTH_CLIENT_REGISTERED',
      endpointId,
      userId: user.id,
      route: `/api/endpoints/${endpointId}/oauth-clients`,
      metadata: {
        client_id: newClient.client_id,
        client_name: newClient.client_name,
        client_type: newClient.client_type,
      },
    });

    return NextResponse.json(newClient, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to create OAuth client', message: error.message },
      { status: 400 }
    );
  }
}
