import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { encryptAuthConfig, decryptAuthConfig, sanitizeIntegration } from '@/lib/crypto';

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
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

    const integration =
      await prisma.integration.findUnique({
        where: {
          id: context.params.id,
          user_id: user.id
        },
        include: {
          tools: {
            orderBy: {
              created_at: 'asc',
            },
          },
        },
      });

    if (!integration) {
      return NextResponse.json(
        {
          error: 'Integration not found',
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(sanitizeIntegration(integration));
  } catch (error) {
    console.error(
      '[GET /api/integrations/:id] Error:',
      error
    );

    return NextResponse.json(
      {
        error: 'Failed to fetch integration',
      },
      {
        status: 500,
      }
    );
  }
}

export async function PUT(
  request: Request,
  context: RouteContext
) {
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

    const body = await request.json();

    const existing =
      await prisma.integration.findUnique({
        where: {
          id: context.params.id,
          user_id: user.id
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          error: 'Integration not found',
        },
        {
          status: 404,
        }
      );
    }

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
    } = body;

    let finalSlug =
      existing.slug;

    if (slug || name) {
      finalSlug = normalizeSlug(
        String(slug || name)
      );
    }

    const duplicate =
      await prisma.integration.findFirst({
        where: {
          slug: finalSlug,
          user_id: user.id,
          NOT: {
            id: context.params.id,
          },
        },
      });

    if (duplicate) {
      return NextResponse.json(
        {
          error:
            'An integration with this slug already exists',
        },
        {
          status: 409,
        }
      );
    }

    // Handle credential encryption & updates
    let updatedEncryptedData: string | null | undefined = undefined;
    let updatedIv: string | null | undefined = undefined;
    let updatedTag: string | null | undefined = undefined;

    const targetAuthType = auth_type !== undefined ? String(auth_type) : existing.auth_type;

    if (targetAuthType === 'none') {
      updatedEncryptedData = null;
      updatedIv = null;
      updatedTag = null;
    } else if (auth_config !== undefined) {
      const authConfigObj = typeof auth_config === 'string' ? JSON.parse(auth_config) : (auth_config || {});
      const hasNewSecret = Boolean(
        (authConfigObj.credential && String(authConfigObj.credential).trim()) ||
        (authConfigObj.key && String(authConfigObj.key).trim()) ||
        (authConfigObj.token && String(authConfigObj.token).trim()) ||
        (authConfigObj.password && String(authConfigObj.password).trim())
      );

      if (hasNewSecret) {
        // User supplied a new credential
        const encrypted = encryptAuthConfig(authConfigObj);
        updatedEncryptedData = encrypted?.encryptedData ?? null;
        updatedIv = encrypted?.iv ?? null;
        updatedTag = encrypted?.tag ?? null;
      } else {
        // User kept credential blank; preserve existing credential and merge new metadata if any
        if (existing.encrypted_auth_config && existing.auth_config_iv && existing.auth_config_tag) {
          try {
            const oldConfig = decryptAuthConfig(
              existing.encrypted_auth_config,
              existing.auth_config_iv,
              existing.auth_config_tag
            ) || {};
            const merged = { ...oldConfig, ...authConfigObj };
            delete merged.credential; // ensure no empty string overwrites old credential
            if (oldConfig.credential) merged.credential = oldConfig.credential;
            if (oldConfig.key) merged.key = oldConfig.key;
            if (oldConfig.token) merged.token = oldConfig.token;
            if (oldConfig.password) merged.password = oldConfig.password;

            const encrypted = encryptAuthConfig(merged);
            updatedEncryptedData = encrypted?.encryptedData ?? null;
            updatedIv = encrypted?.iv ?? null;
            updatedTag = encrypted?.tag ?? null;
          } catch {
            // Keep existing fields unchanged if decryption fails
          }
        }
      }
    }

    const integration =
      await prisma.integration.update({
        where: {
          id: context.params.id,
          user_id: user.id
        },
        data: {
          ...(name !== undefined && {
            name: String(name).trim(),
          }),

          slug: finalSlug,

          ...(description !== undefined && {
            description:
              description
                ? String(description).trim()
                : null,
          }),

          ...(icon !== undefined && {
            icon:
              icon
                ? String(icon).trim()
                : null,
          }),

          ...(category !== undefined && {
            category:
              category
                ? String(category).trim()
                : null,
          }),

          ...(base_url !== undefined && {
            base_url:
              String(base_url)
                .trim()
                .replace(/\/+$/, ''),
          }),

          ...(auth_type !== undefined && {
            auth_type:
              String(auth_type),
          }),

          auth_config: null, // JANGAN simpan plaintext

          ...(updatedEncryptedData !== undefined && {
            encrypted_auth_config: updatedEncryptedData,
            auth_config_iv: updatedIv,
            auth_config_tag: updatedTag,
          }),

          ...(typeof is_active ===
            'boolean' && {
            is_active,
          }),
        },
        include: {
          tools: true,
        },
      });

    return NextResponse.json(sanitizeIntegration(integration));
  } catch (error: any) {
    console.error(
      '[PUT /api/integrations/:id] Error:',
      error
    );

    return NextResponse.json(
      {
        error: 'Failed to update integration',
        details: error?.message,
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext
) {
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

    const existing =
      await prisma.integration.findUnique({
        where: {
          id: context.params.id,
          user_id: user.id
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          error: 'Integration not found',
        },
        {
          status: 404,
        }
      );
    }

    await prisma.integration.delete({
      where: {
        id: context.params.id,
        user_id: user.id
      },
    });

    return NextResponse.json({
      success: true,
      id: context.params.id,
    });
  } catch (error: any) {
    console.error(
      '[DELETE /api/integrations/:id] Error:',
      error
    );

    return NextResponse.json(
      {
        error: 'Failed to delete integration',
        details: error?.message,
      },
      {
        status: 500,
      }
    );
  }
}