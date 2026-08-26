// app/api/endpoints/logs/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function GET(req: Request) {
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
    const limit = parseInt(url.searchParams.get('limit') || '50');

    // Ambil log yang berelasi dengan McpEndpoint milik user ini
    const logs = await prisma.executionLog.findMany({
      where: {
        endpoint: {
          user_id: user.id
        }
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      include: {
        endpoint: { select: { name: true } }
      }
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Logs fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}