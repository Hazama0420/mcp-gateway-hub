// app/api/endpoints/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { encrypt } from '@/lib/crypto';
import * as crypto from 'crypto';
import bcrypt from 'bcryptjs';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Cari user berdasarkan email untuk mendapatkan ID
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
        services: true,
      },
      orderBy: { created_at: 'desc' }
    });

    return NextResponse.json(endpoints);
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

    // Generate a secure API key
    const rawApiKey = `mcp_${crypto.randomBytes(32).toString('hex')}`;
    const salt = await bcrypt.genSalt(10);
    const apiKeyHash = await bcrypt.hash(rawApiKey, salt);

    // Lakukan enkripsi otomatis di backend untuk setiap service agar iv & tag tidak kosong
    const servicesWithEncryption = (services || []).map((service: any) => {
      // Ubah config objek menjadi string JSON
      const configString = JSON.stringify(service.config || {});
      
      // Panggil fungsi encrypt dari lib/crypto.ts
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
        name,
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
        services: true,
      },
    });

    // Return the plaintext key ONLY ONCE during creation
    return NextResponse.json({ ...endpoint, apiKey: rawApiKey }, { status: 201 });
  } catch (error) {
    console.error('Create endpoint error:', error);
    return NextResponse.json({ error: 'Failed to create endpoint' }, { status: 500 });
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

    // Pastikan endpoint milik user yang sedang aktif
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