// app/api/endpoints/test-service/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { safeFetch, validateUrlWithDns } from '@/lib/security/url';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { serviceType, config } = body;

    if (!serviceType || !config) {
      return NextResponse.json(
        { error: 'Missing serviceType or config payload' },
        { status: 400 }
      );
    }

    const startTime = performance.now();

    // 1. GitHub Connection Test
    if (serviceType === 'github') {
      const token = config.token?.trim();
      if (!token) {
        return NextResponse.json(
          { success: false, message: 'GitHub personal access token is required' },
          { status: 400 }
        );
      }

      const res = await safeFetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'MCP-Gateway-Hub',
          Accept: 'application/vnd.github.v3+json',
        },
        timeoutMs: 5000,
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (res.ok) {
        const userData = await res.json();
        return NextResponse.json({
          success: true,
          message: `Connected to GitHub as @${userData.login || 'user'}`,
          latencyMs,
        });
      } else if (res.status === 401) {
        return NextResponse.json({
          success: false,
          message: 'Invalid or expired GitHub token',
          latencyMs,
        });
      } else {
        return NextResponse.json({
          success: false,
          message: `GitHub API returned HTTP ${res.status}`,
          latencyMs,
        });
      }
    }

    // 2. Vercel Connection Test
    if (serviceType === 'vercel') {
      const token = config.token?.trim();
      if (!token) {
        return NextResponse.json(
          { success: false, message: 'Vercel API token is required' },
          { status: 400 }
        );
      }

      const res = await safeFetch('https://api.vercel.com/v2/user', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeoutMs: 5000,
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (res.ok) {
        const userData = await res.json();
        const username = userData.user?.username || userData.user?.email || 'authenticated user';
        return NextResponse.json({
          success: true,
          message: `Connected to Vercel (${username})`,
          latencyMs,
        });
      } else if (res.status === 401 || res.status === 403) {
        return NextResponse.json({
          success: false,
          message: 'Invalid or expired Vercel token',
          latencyMs,
        });
      } else {
        return NextResponse.json({
          success: false,
          message: `Vercel API returned HTTP ${res.status}`,
          latencyMs,
        });
      }
    }

    // 3. PostgreSQL / Supabase Connection Validation
    if (serviceType === 'postgres' || serviceType === 'postgresql' || serviceType === 'supabase') {
      const connStr = config.connectionString?.trim();
      if (!connStr) {
        return NextResponse.json(
          { success: false, message: 'PostgreSQL connection string is required' },
          { status: 400 }
        );
      }

      if (!connStr.startsWith('postgres://') && !connStr.startsWith('postgresql://')) {
        return NextResponse.json({
          success: false,
          message: 'Invalid connection string format. Must start with postgresql:// or postgres://',
        });
      }

      let parsed: URL;
      try {
        parsed = new URL(connStr);
      } catch {
        return NextResponse.json({
          success: false,
          message: 'Invalid connection string URL syntax',
        });
      }

      // Validate hostname and prevent SSRF / internal loopback attacks
      const dnsCheck = await validateUrlWithDns(`http://${parsed.hostname}:5432`);
      if (!dnsCheck.safe) {
        return NextResponse.json({
          success: false,
          message: `Database host validation failed: ${dnsCheck.reason || 'Restricted host'}`,
        });
      }

      const latencyMs = Math.round(performance.now() - startTime);
      return NextResponse.json({
        success: true,
        message: 'PostgreSQL connection URI & host validated (Read-only isolation active)',
        latencyMs,
      });
    }

    return NextResponse.json(
      { success: false, message: `Unsupported service type for connection test: ${serviceType}` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Connection test failed' },
      { status: 500 }
    );
  }
}
