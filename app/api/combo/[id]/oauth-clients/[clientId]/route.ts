// app/api/combo/[id]/oauth-clients/[clientId]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { revokeComboOAuthClient, deleteComboOAuthClient } from '@/lib/oauth/store';
import { recordSecurityEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/combo/[id]/oauth-clients/[clientId]
 * Explicitly revokes an active OAuth client for this Combo.
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

  const { id: comboId, clientId } = params;

  const combo = await prisma.combo.findFirst({
    where: { id: comboId, user_id: user.id },
  });

  if (!combo) {
    return NextResponse.json({ error: 'Combo not found or unauthorized' }, { status: 404 });
  }

  try {
    const result = await revokeComboOAuthClient(clientId, comboId, user.id);

    recordSecurityEvent({
      eventType: 'AUTH_FAILED',
      endpointId: comboId,
      userId: user.id,
      route: `/api/combo/${comboId}/oauth-clients/${clientId}`,
      reason: 'OAuth client revoked by combo owner',
      metadata: { client_id: clientId, combo_id: comboId, action: 'revoke' },
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
 * DELETE /api/combo/[id]/oauth-clients/[clientId]
 * Permanently deletes a revoked/inactive OAuth client for this Combo.
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

  const { id: comboId, clientId } = params;

  const combo = await prisma.combo.findFirst({
    where: { id: comboId, user_id: user.id },
  });

  if (!combo) {
    return NextResponse.json({ error: 'Combo not found or unauthorized' }, { status: 404 });
  }

  const url = new URL(req.url);
  const actionParam = url.searchParams.get('action');

  try {
    // If explicit revoke action requested via query
    if (actionParam === 'revoke') {
      const result = await revokeComboOAuthClient(clientId, comboId, user.id);
      return NextResponse.json(result);
    }

    const result = await deleteComboOAuthClient(clientId, comboId, user.id);

    recordSecurityEvent({
      eventType: 'CONTROL_PLANE_ACCESS',
      endpointId: comboId,
      userId: user.id,
      route: `/api/combo/${comboId}/oauth-clients/${clientId}`,
      metadata: { client_id: clientId, combo_id: comboId, action: 'delete_client' },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to delete OAuth client', message: error.message },
      { status: 400 }
    );
  }
}
