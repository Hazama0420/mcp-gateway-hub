import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
    const integration =
      await prisma.integration.findUnique({
        where: {
          id: context.params.id,
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

    return NextResponse.json(integration);
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
    const body = await request.json();

    const existing =
      await prisma.integration.findUnique({
        where: {
          id: context.params.id,
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

    const integration =
      await prisma.integration.update({
        where: {
          id: context.params.id,
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

          ...(auth_config !== undefined && {
            auth_config,
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

    return NextResponse.json(integration);
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
    const existing =
      await prisma.integration.findUnique({
        where: {
          id: context.params.id,
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