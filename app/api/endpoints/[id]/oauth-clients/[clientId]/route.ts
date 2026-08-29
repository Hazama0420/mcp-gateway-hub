// app/api/endpoints/[id]/oauth-clients/[clientId]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { revokeEndpointOAuthClient, deleteEndpointOAuthClient } from '@/lib/oauth/store';
import { recordSecurityEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/endpoints/[id]/oauth-clients/[clientId]
 * Explicitly revokes an active OAuth client.
 */
export async function PATCH(
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
      eventType: 'AUTH_FAILED',
      endpointId,
      userId: user.id,
      route: `/api/endpoints/${endpointId}/oauth-clients/${clientId}`,
      reason: 'OAuth client revoked by endpoint owner',
      metadata: { client_id: clientId, action: 'revoke' },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to revoke OAuth client', message: error.message },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/endpoints/[id]/oauth-clients/[clientId]
 * Permanently deletes a revoked/inactive OAuth client.
 * If client is still active, returns 400 (must be revoked first).
 */
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

  const url = new URL(req.url);
  const actionParam = url.searchParams.get('action');

  try {
    // If explicit revoke action requested via query
    if (actionParam === 'revoke') {
      const result = await revokeEndpointOAuthClient(clientId, endpointId, user.id);
      recordSecurityEvent({
        eventType: 'AUTH_FAILED',
        endpointId,
        userId: user.id,
        route: `/api/endpoints/${endpointId}/oauth-clients/${clientId}`,
        reason: 'OAuth client revoked by endpoint owner',
        metadata: { client_id: clientId, action: 'revoke' },
      });
      return NextResponse.json(result);
    }

    // Default DELETE: Permanent deletion of revoked/inactive client
    const result = await deleteEndpointOAuthClient(clientId, endpointId, user.id);

    recordSecurityEvent({
      eventType: 'AUTH_FAILED',
      endpointId,
      userId: user.id,
      route: `/api/endpoints/${endpointId}/oauth-clients/${clientId}`,
      reason: 'OAuth client permanently deleted by endpoint owner',
      metadata: { client_id: clientId, action: 'delete' },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to process OAuth client operation', message: error.message },
      { status: 400 }
    );
  }
}
