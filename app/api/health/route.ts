// app/api/health/route.ts
import prisma from '@/lib/prisma';
import packageInfo from '@/package.json';

export const dynamic = 'force-dynamic';

const DB_TIMEOUT_MS = 3000;

/**
 * Executes a lightweight database connectivity check using `SELECT 1`.
 */
export async function checkDatabaseHealth(client = prisma): Promise<{ status: 'ok' | 'error'; latencyMs?: number }> {
  const startTime = performance.now();
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database query timeout')), DB_TIMEOUT_MS)
    );

    const queryPromise = client.$queryRaw`SELECT 1`;

    await Promise.race([queryPromise, timeoutPromise]);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      status: 'ok',
      latencyMs,
    };
  } catch (error) {
    // Fail safely without logging or exposing internal error/connection details
    return {
      status: 'error',
    };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const probe = url.searchParams.get('probe');

  const headers = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Type': 'application/json',
  };

  // 1. Pure Liveness Probe (process is alive)
  if (probe === 'liveness') {
    return Response.json(
      {
        status: 'ok',
        version: packageInfo.version || '0.1.0',
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.round(process.uptime() * 10) / 10,
      },
      { status: 200, headers }
    );
  }

  // 2. Full Readiness & Health Check (including Database)
  const dbHealth = await checkDatabaseHealth();
  const isHealthy = dbHealth.status === 'ok';

  const responsePayload = {
    status: isHealthy ? 'ok' : 'degraded',
    version: packageInfo.version || '0.1.0',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.round(process.uptime() * 10) / 10,
    services: {
      database: {
        status: dbHealth.status,
        ...(dbHealth.latencyMs !== undefined && { latency_ms: dbHealth.latencyMs }),
      },
    },
  };

  return Response.json(responsePayload, {
    status: isHealthy ? 200 : 503,
    headers,
  });
}
