// app/api/integrations/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { encryptAuthConfig, sanitizeIntegration } from '@/lib/crypto';

function createSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Ambil integrasi HANYA milik user yang sedang login
    const integrations = await prisma.integration.findMany({
      where: {
        user_id: user.id
      },
      include: {
        tools: {
          orderBy: {
            created_at: 'asc',
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return NextResponse.json(integrations.map(sanitizeIntegration));
  } catch (error) {
    console.error('[GET /api/integrations] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();

    const {
      name,
      slug,
      description,
      icon,
      category,
      base_url,
      auth_type,
      auth_config,
      is_active,
      tools,
    } = body;

    if (!name || !base_url) {
      return NextResponse.json(
        { error: 'Integration name and base_url are required' },
        { status: 400 }
      );
    }

    const finalSlug = createSlug(slug || name);

    if (!finalSlug) {
      return NextResponse.json(
        { error: 'Invalid integration slug' },
        { status: 400 }
      );
    }

    // Cek apakah slug sudah ada khusus untuk user ini
    const existing = await prisma.integration.findFirst({
      where: {
        user_id: user.id,
        slug: finalSlug,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'An integration with this slug already exists for your account' },
        { status: 409 }
      );
    }

    if (tools !== undefined && !Array.isArray(tools)) {
      return NextResponse.json(
        { error: 'tools must be an array' },
        { status: 400 }
      );
    }

    // Enkripsi auth_config jika ada
    let encryptedAuthConfig: { encryptedData: string; iv: string; tag: string } | null = null;
    const finalAuthType = auth_type ? String(auth_type) : 'none';

    if (finalAuthType !== 'none' && auth_config) {
      try {
        encryptedAuthConfig = encryptAuthConfig(auth_config);
      } catch (err: any) {
        return NextResponse.json(
          { error: 'Failed to securely encrypt integration credentials' },
          { status: 500 }
        );
      }
    }

    const integration = await prisma.integration.create({
      data: {
        user_id: user.id,
        name: String(name).trim(),
        slug: finalSlug,
        description: description ? String(description).trim() : null,
        icon: icon ? String(icon).trim() : null,
        category: category ? String(category).trim() : null,
        base_url: String(base_url).trim().replace(/\/+$/, ''),
        auth_type: finalAuthType,
        auth_config: null, // JANGAN simpan plaintext
        encrypted_auth_config: encryptedAuthConfig?.encryptedData ?? null,
        auth_config_iv: encryptedAuthConfig?.iv ?? null,
        auth_config_tag: encryptedAuthConfig?.tag ?? null,
        is_active: typeof is_active === 'boolean' ? is_active : true,
        tools:
          Array.isArray(tools) && tools.length > 0
            ? {
                create: tools.map((tool: any) => ({
                  name: String(tool.name || '').trim(),
                  description: tool.description ? String(tool.description).trim() : null,
                  method: String(tool.method || 'GET').toUpperCase(),
                  path: String(tool.path || '/').trim(),
                  input_schema: tool.input_schema ?? null,
                  headers_template: tool.headers_template ?? null,
                  query_template: tool.query_template ?? null,
                  body_template: tool.body_template ?? null,
                  response_mapping: tool.response_mapping ?? null,
                  permission: tool.permission ? String(tool.permission).toLowerCase() : 'read',
                  is_enabled: typeof tool.is_enabled === 'boolean' ? tool.is_enabled : true,
                })),
              }
            : undefined,
      },
      include: {
        tools: true,
      },
    });

    return NextResponse.json(sanitizeIntegration(integration), { status: 201 });
  } catch (error: any) {
    console.error('[POST /api/integrations] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create integration', details: error?.message },
      { status: 500 }
    );
  }
}