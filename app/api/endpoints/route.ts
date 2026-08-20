// app/api/endpoints/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';

// GET /api/endpoints
export async function GET() {
  try {
    const endpoints = await prisma.mcpEndpoint.findMany({
      where: { user_id: 'default_user' },
      include: { services: true },
      orderBy: { created_at: 'desc' },
    });
    return NextResponse.json(endpoints);
  } catch (error: any) {
    console.error('[GET /api/endpoints] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch endpoints', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/endpoints
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, services } = body;

    if (!name || !services || services.length === 0) {
      return NextResponse.json(
        { error: 'Name and services are required' },
        { status: 400 }
      );
    }

    // Cek ENCRYPTION_MASTER_KEY
    if (!process.env.ENCRYPTION_MASTER_KEY || process.env.ENCRYPTION_MASTER_KEY.length !== 32) {
      console.error('[POST] ENCRYPTION_MASTER_KEY invalid');
      return NextResponse.json(
        { error: 'Server encryption key missing or invalid' },
        { status: 500 }
      );
    }

    // Enkripsi setiap service
    const encryptedServices = services.map((svc: any) => {
      const configJson = JSON.stringify(svc.config);
      const { iv, tag, encryptedData } = encrypt(configJson);
      return {
        service_type: svc.type,
        encrypted_config: encryptedData,
        iv,
        tag,
      };
    });

    const endpoint = await prisma.mcpEndpoint.create({
      data: {
        name,
        user_id: 'default_user',
        services: {
          create: encryptedServices,
        },
      },
      include: { services: true },
    });

    return NextResponse.json({ ...endpoint }, { status: 201 });
  } catch (error: any) {
    console.error('[POST /api/endpoints] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create endpoint', details: error.message },
      { status: 500 }
    );
  }
}