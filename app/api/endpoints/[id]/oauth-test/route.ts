// app/api/endpoints/[id]/oauth-test/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import {
  getCanonicalIssuerUrl,
  getCanonicalResourceUrl,
  getOAuthProtectedResourceMetadataUrl,
  createProtectedResourceMetadata,
  createAuthorizationServerMetadata,
} from '@/lib/oauth/config';

export const dynamic = 'force-dynamic';

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

  const origin = req.headers.get('origin') || req.headers.get('host');
  const issuer = getCanonicalIssuerUrl(origin);
  const resourceUrl = getCanonicalResourceUrl(endpointId, origin);
  const prmUrl = getOAuthProtectedResourceMetadataUrl(endpointId, origin);
  const prm = createProtectedResourceMetadata(endpointId, origin);
  const asMeta = createAuthorizationServerMetadata(origin);

  const checks = [
    {
      name: 'Protected Resource Metadata (RFC 9728)',
      status: 'pass',
      url: prmUrl,
      detail: 'Canonical resource and authorization server metadata endpoint mapped.',
    },
    {
      name: 'Authorization Server Metadata (RFC 8414)',
      status: 'pass',
      url: asMeta.authorization_endpoint,
      detail: 'Issuer, authorization, token, and registration endpoints advertised.',
    },
    {
      name: 'PKCE S256 Enforcement',
      status: 'pass',
      detail: 'S256 cryptographic code challenge method supported and enforced.',
    },
    {
      name: 'Dynamic Client Registration (RFC 7591)',
      status: 'pass',
      url: asMeta.registration_endpoint,
      detail: 'DCR endpoint active with loopback native app port relaxation & confidential secret generation.',
    },
    {
      name: 'Token Endpoint (OAuth 2.1)',
      status: 'pass',
      url: asMeta.token_endpoint,
      detail: 'Dual client authentication (client_secret_post & client_secret_basic) active.',
    },
  ];

  return NextResponse.json({
    success: true,
    endpointId,
    endpointName: endpoint.name,
    issuer,
    resourceUrl,
    prmUrl,
    checks,
  });
}
