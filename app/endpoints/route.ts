// app/api/endpoints/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    // Tolak akses jika belum login
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ambil endpoint HANYA yang dimiliki oleh email user yang login
    const endpoints = await prisma.endpoint.findMany({
      where: {
        user: { email: session.user.email }
      },
      include: {
        services: true,
      },
      orderBy: { created_at: 'desc' }
    });

    return NextResponse.json(endpoints);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, services } = body;

    // Cari ID user berdasarkan email
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    const endpoint = await prisma.endpoint.create({
      data: {
        name,
        userId: user?.id, // <-- Kaitkan endpoint baru dengan User ID ini
        services: {
          create: services.map((service: any) => ({
            service_type: service.type,
            config: service.config || {},
          })),
        },
      },
      include: { services: true },
    });

    return NextResponse.json(endpoint, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create endpoint' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    // Cek apakah endpoint ini benar-benar milik user yang sedang login
    const existing = await prisma.endpoint.findFirst({
      where: { 
        id, 
        user: { email: session.user.email } 
      }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Endpoint not found or unauthorized' }, { status: 404 });
    }

    await prisma.endpoint.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}