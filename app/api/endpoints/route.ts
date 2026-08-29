// app/api/endpoints/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { encrypt } from '@/lib/crypto';
import * as crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { calculateEndpointToolCount } from '@/lib/adapters/registry';


export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const endpointId = url.searchParams.get('id');

    if (endpointId) {
      const endpoint = await prisma.mcpEndpoint.findFirst({
        where: {
          id: endpointId,
          user_id: user.id,
        },
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
              created_at: true,
            },
          },
        },
      });

      if (!endpoint) {
        return NextResponse.json({ error: 'Endpoint not found or unauthorized' }, { status: 404 });
      }

      const toolCount = calculateEndpointToolCount(endpoint.services);
      return NextResponse.json({ ...endpoint, tool_count: toolCount });
    }

    // Ambil McpEndpoint HANYA milik user_id yang sedang login
    const endpoints = await prisma.mcpEndpoint.findMany({
      where: {
        user_id: user.id
      },
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
            created_at: true,
          },
        },
      },
      orderBy: { created_at: 'desc' }
    });

    const enrichedEndpoints = endpoints.map((ep) => ({
      ...ep,
      tool_count: calculateEndpointToolCount(ep.services),
    }));

    return NextResponse.json(enrichedEndpoints);
  } catch (error) {
    console.error('Fetch endpoints error:', error);
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
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await req.json();
    const { name, services } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Connection name is required' }, { status: 400 });
    }

    // Generate a secure API key
    const rawApiKey = `mcp_${crypto.randomBytes(32).toString('hex')}`;
    const salt = await bcrypt.genSalt(10);
    const apiKeyHash = await bcrypt.hash(rawApiKey, salt);

    // Lakukan enkripsi otomatis di backend untuk setiap service agar iv & tag tidak kosong
    const servicesWithEncryption = (services || []).map((service: any) => {
      const configString = JSON.stringify(service.config || {});
      const { encryptedData, iv, tag } = encrypt(configString);

      return {
        service_type: service.type || service.service_type,
        encrypted_config: encryptedData,
        iv: iv,
        tag: tag,
      };
    });

    const endpoint = await prisma.mcpEndpoint.create({
      data: {
        name: name.trim(),
        user_id: user.id,
        api_key_hash: apiKeyHash,
        services: {
          create: servicesWithEncryption,
        },
      },
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
            created_at: true,
          },
        },
      },
    });

    const toolCount = calculateEndpointToolCount(endpoint.services);
    return NextResponse.json(
      { ...endpoint, apiKey: rawApiKey, tool_count: toolCount },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create endpoint error:', error);
    return NextResponse.json({ error: 'Failed to create endpoint' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await req.json();
    const { id, name, is_active, services } = body;

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const existing = await prisma.mcpEndpoint.findFirst({
      where: {
        id,
        user_id: user.id
      },
      include: {
        services: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Endpoint not found or unauthorized' }, { status: 404 });
    }

    // If services bundle is updated
    if (Array.isArray(services)) {
      const updatedServices = services.map((svc: any) => {
        const sType = svc.type || svc.service_type;
        // Check if config was passed newly or if existing config should be retained
        if (svc.config && Object.keys(svc.config).length > 0) {
          const configString = JSON.stringify(svc.config);
          const { encryptedData, iv, tag } = encrypt(configString);
          return {
            endpoint_id: id,
            service_type: sType,
            encrypted_config: encryptedData,
            iv,
            tag,
          };
        }

        // Look for existing service record
        const existingSvc = existing.services.find(
          (s) => s.service_type.toLowerCase() === sType.toLowerCase()
        );

        if (existingSvc) {
          return {
            endpoint_id: id,
            service_type: existingSvc.service_type,
            encrypted_config: existingSvc.encrypted_config,
            iv: existingSvc.iv,
            tag: existingSvc.tag,
          };
        }

        // Fallback with empty config
        const { encryptedData, iv, tag } = encrypt('{}');
        return {
          endpoint_id: id,
          service_type: sType,
          encrypted_config: encryptedData,
          iv,
          tag,
        };
      });

      await prisma.$transaction(async (tx) => {
        await tx.endpointService.deleteMany({
          where: { endpoint_id: id },
        });

        if (updatedServices.length > 0) {
          await tx.endpointService.createMany({
            data: updatedServices,
          });
        }

        await tx.mcpEndpoint.update({
          where: { id },
          data: {
            ...(name !== undefined ? { name: name.trim() } : {}),
            ...(is_active !== undefined ? { is_active: Boolean(is_active) } : {}),
          },
        });
      });
    } else {
      await prisma.mcpEndpoint.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(is_active !== undefined ? { is_active: Boolean(is_active) } : {}),
        },
      });
    }

    const updated = await prisma.mcpEndpoint.findUnique({
      where: { id },
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
            created_at: true,
          },
        },
      },
    });

    if (!updated) {
      return NextResponse.json({ error: 'Endpoint not found after update' }, { status: 404 });
    }

    const toolCount = calculateEndpointToolCount(updated.services);
    return NextResponse.json({ ...updated, tool_count: toolCount });
  } catch (error) {
    console.error('Update endpoint error:', error);
    return NextResponse.json({ error: 'Failed to update endpoint' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const existing = await prisma.mcpEndpoint.findFirst({
      where: { 
        id, 
        user_id: user.id 
      }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Endpoint not found or unauthorized' }, { status: 404 });
    }

    await prisma.mcpEndpoint.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete endpoint error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}