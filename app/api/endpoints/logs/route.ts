// app/api/endpoints/logs/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

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
    const rawLimit = parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);

    const statusFilter = url.searchParams.get('status');
    const toolFilter = url.searchParams.get('tool_name');
    const sourceFilter = url.searchParams.get('source');

    // Strict Tenant Isolation: Only logs owned directly by this user or via their McpEndpoints
    const whereClause: any = {
      OR: [
        { user_id: user.id },
        { endpoint: { user_id: user.id } },
      ],
    };

    if (statusFilter) {
      whereClause.status = statusFilter;
    }
    if (toolFilter) {
      whereClause.tool_name = toolFilter;
    }
    if (sourceFilter) {
      whereClause.source = sourceFilter;
    }

    const logs = await prisma.executionLog.findMany({
      where: whereClause,
      orderBy: { created_at: 'desc' },
      take: limit,
      include: {
        endpoint: { select: { name: true } },
      },
    });

    const safeLogs = logs.map((log) => ({
      id: log.id,
      execution_id: log.execution_id,
      endpoint_id: log.endpoint_id,
      endpoint: log.endpoint ? { name: log.endpoint.name } : null,
      tool_name: log.tool_name,
      source: log.source,
      status: log.status,
      error_category: log.error_category,
      execution_time_ms: log.execution_time_ms,
      result_size: log.result_size,
      metadata: log.metadata,
      created_at: log.created_at,
    }));

    return NextResponse.json({ logs: safeLogs });
  } catch (error) {
    console.error('[GET /api/endpoints/logs] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}