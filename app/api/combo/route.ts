// app/api/combo/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { calculateEndpointToolCount, calculateComboToolCount } from '@/lib/adapters/registry';


export async function GET(req: Request) {
  try {
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

    const url = new URL(req.url);
    const comboId = url.searchParams.get('id');

    if (comboId) {
      const combo = await prisma.combo.findFirst({
        where: {
          id: comboId,
          user_id: user.id,
        },
        include: {
          endpoints: {
            include: {
              endpoint: {
                select: {
                  id: true,
                  name: true,
                  is_active: true,
                  services: {
                    select: {
                      id: true,
                      service_type: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!combo) {
        return NextResponse.json({ error: 'Combo not found or unauthorized' }, { status: 404 });
      }

      const toolCount = calculateComboToolCount(combo.endpoints as any);
      return NextResponse.json({
        ...combo,
        tool_count: toolCount,
        adapters_count: combo.endpoints.length,
      });
    }

    const combos = await prisma.combo.findMany({
      where: {
        user_id: user.id,
      },
      include: {
        endpoints: {
          include: {
            endpoint: {
              select: {
                id: true,
                name: true,
                is_active: true,
                services: {
                  select: {
                    id: true,
                    service_type: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const enrichedCombos = combos.map((c) => ({
      ...c,
      tool_count: calculateComboToolCount(c.endpoints as any),
      adapters_count: c.endpoints.length,
    }));

    return NextResponse.json(enrichedCombos);
  } catch (error) {
    console.error('Fetch combos error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
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

    const body = await req.json();
    const { name, description, endpoint_ids } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Combo name is required' }, { status: 400 });
    }

    if (!Array.isArray(endpoint_ids) || endpoint_ids.length === 0) {
      return NextResponse.json({ error: 'Please select at least one adapter/endpoint for this Combo.' }, { status: 400 });
    }

    // Tenant / Ownership Verification: Ensure ALL selected endpoints belong strictly to this user
    const ownedEndpoints = await prisma.mcpEndpoint.findMany({
      where: {
        id: { in: endpoint_ids },
        user_id: user.id,
      },
      select: { id: true },
    });

    if (ownedEndpoints.length !== endpoint_ids.length) {
      return NextResponse.json(
        { error: 'One or more selected adapters do not belong to you or do not exist.' },
        { status: 403 }
      );
    }

    const combo = await prisma.combo.create({
      data: {
        name: name.trim(),
        description: description ? description.trim() : null,
        user_id: user.id,
        endpoints: {
          create: endpoint_ids.map((endpoint_id: string) => ({
            endpoint_id,
          })),
        },
      },
      include: {
        endpoints: {
          include: {
            endpoint: {
              select: {
                id: true,
                name: true,
                is_active: true,
                services: {
                  select: {
                    id: true,
                    service_type: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const toolCount = calculateComboToolCount(combo.endpoints as any);
    return NextResponse.json(
      {
        ...combo,
        tool_count: toolCount,
        adapters_count: combo.endpoints.length,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create combo error:', error);
    return NextResponse.json({ error: 'Failed to create combo' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await req.json();
    const { id, name, description, is_active, endpoint_ids } = body;

    if (!id) return NextResponse.json({ error: 'Combo ID is required' }, { status: 400 });

    const existing = await prisma.combo.findFirst({
      where: {
        id,
        user_id: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Combo not found or unauthorized' }, { status: 404 });
    }

    if (Array.isArray(endpoint_ids)) {
      if (endpoint_ids.length === 0) {
        return NextResponse.json({ error: 'A Combo must contain at least one adapter.' }, { status: 400 });
      }

      // Verify ownership of all new endpoint IDs
      const ownedEndpoints = await prisma.mcpEndpoint.findMany({
        where: {
          id: { in: endpoint_ids },
          user_id: user.id,
        },
        select: { id: true },
      });

      if (ownedEndpoints.length !== endpoint_ids.length) {
        return NextResponse.json(
          { error: 'One or more selected adapters do not belong to you or do not exist.' },
          { status: 403 }
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.comboEndpoint.deleteMany({
          where: { combo_id: id },
        });

        await tx.comboEndpoint.createMany({
          data: endpoint_ids.map((endpoint_id: string) => ({
            combo_id: id,
            endpoint_id,
          })),
        });

        await tx.combo.update({
          where: { id },
          data: {
            ...(name !== undefined ? { name: name.trim() } : {}),
            ...(description !== undefined ? { description: description ? description.trim() : null } : {}),
            ...(is_active !== undefined ? { is_active: Boolean(is_active) } : {}),
          },
        });
      });
    } else {
      await prisma.combo.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(description !== undefined ? { description: description ? description.trim() : null } : {}),
          ...(is_active !== undefined ? { is_active: Boolean(is_active) } : {}),
        },
      });
    }

    const updated = await prisma.combo.findUnique({
      where: { id },
      include: {
        endpoints: {
          include: {
            endpoint: {
              select: {
                id: true,
                name: true,
                is_active: true,
                services: {
                  select: {
                    id: true,
                    service_type: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!updated) {
      return NextResponse.json({ error: 'Combo not found after update' }, { status: 404 });
    }

    const toolCount = calculateComboToolCount(updated.endpoints as any);
    return NextResponse.json({
      ...updated,
      tool_count: toolCount,
      adapters_count: updated.endpoints.length,
    });
  } catch (error) {
    console.error('Update combo error:', error);
    return NextResponse.json({ error: 'Failed to update combo' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const existing = await prisma.combo.findFirst({
      where: {
        id,
        user_id: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Combo not found or unauthorized' }, { status: 404 });
    }

    // Delete ONLY the Combo and its join links. Underlying McpEndpoints remain intact!
    await prisma.combo.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete combo error:', error);
    return NextResponse.json({ error: 'Failed to delete combo' }, { status: 500 });
  }
}
