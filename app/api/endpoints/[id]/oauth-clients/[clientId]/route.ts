// app/api/endpoints/[id]/oauth-clients/[clientId]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { revokeEndpointOAuthClient } from '@/lib/oauth/store';
import { recordSecurityEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; clientId: string } }
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

  const { id: endpointId, clientId } = params;

  const endpoint = await prisma.mcpEndpoint.findFirst({
    where: { id: endpointId, user_id: user.id },
  });

  if (!endpoint) {
    return NextResponse.json({ error: 'Endpoint not found or unauthorized' }, { status: 404 });
  }

  try {
    const result = await revokeEndpointOAuthClient(clientId, endpointId, user.id);

    recordSecurityEvent({
      eventType: 'AUTH_FAILED', // Record revocation event
      endpointId,
      userId: user.id,
      route: `/api/endpoints/${endpointId}/oauth-clients/${clientId}`,
      reason: 'OAuth client revoked by endpoint owner',
      metadata: { client_id: clientId },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to revoke OAuth client', message: error.message },
      { status: 400 }
    );
  }
}
