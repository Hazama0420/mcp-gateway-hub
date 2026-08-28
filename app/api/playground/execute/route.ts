// app/api/playground/execute/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { safeFetch, validateUrlSyntax, MAX_RESPONSE_BYTES } from '@/lib/security/url';
import { checkRateLimit, applyRateLimitHeaders, LIMITS } from '@/lib/security/ratelimit';
import { decryptAuthConfig } from '@/lib/crypto';
import { recordExecutionLog, recordSecurityEvent, generateExecutionId } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const startTime = performance.now();
  const executionId = generateExecutionId();
  let currentUser: any = null;
  let currentTool: any = null;

  try {
    // 0. Validasi Sesi Login NextAuth
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized - Silakan login terlebih dahulu' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }
    currentUser = user;

    // Rate Limit Playground
    const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown';
    const limitIdentifier = `playground:${user.id}:${ip}`;
    const limitResult = await checkRateLimit(limitIdentifier, LIMITS.PLAYGROUND);

    if (!limitResult.success) {
      recordSecurityEvent({
        eventType: 'RATE_LIMITED',
        userId: user.id,
        route: '/api/playground/execute',
        ip: String(ip),
        reason: 'Playground rate limit exceeded',
      });
      const response = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      applyRateLimitHeaders(response, limitResult);
      return response;
    }

    const { toolId, args } = await req.json();

    if (!toolId) {
      return NextResponse.json({ error: 'toolId wajib disertakan' }, { status: 400 });
    }

    // 1. Ambil data tool beserta config integrasinya, pastikan milik user yang aktif
    const tool = await prisma.integrationTool.findFirst({
      where: {
        id: toolId,
        integration: {
          user_id: user.id // <-- Keamanan tambahan: Isolasi kepemilikan multi-tenant
        }
      },
      include: {
        integration: true,
      },
    });

    if (!tool) {
      return NextResponse.json({ error: 'Tool tidak ditemukan atau Anda tidak memiliki akses' }, { status: 404 });
    }
    currentTool = tool;

    const integration = tool.integration;
    const baseUrl = integration.base_url || '';

    // Bersihkan slash ganda pada URL
    let targetUrl = `${baseUrl.replace(/\/+$/, '')}/${tool.path.replace(/^\/+/, '')}`;
    const method = (tool.method || 'GET').toUpperCase();

    // 2. Siapkan Headers
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
    };

    // Dekripsi credential server-side
    let authConfig: any = {};
    if (integration.encrypted_auth_config && integration.auth_config_iv && integration.auth_config_tag) {
      try {
        authConfig = decryptAuthConfig(
          integration.encrypted_auth_config,
          integration.auth_config_iv,
          integration.auth_config_tag
        ) || {};
      } catch (err) {
        return NextResponse.json({
          success: false,
          status: 500,
          statusText: 'Internal Gateway Error',
          latencyMs: Math.round(performance.now() - startTime),
          error: 'Unable to process integration credentials',
        }, { status: 500 });
      }
    } else if (integration.auth_config) {
      // Legacy fallback
      authConfig = typeof integration.auth_config === 'string'
        ? JSON.parse(integration.auth_config)
        : (integration.auth_config || {});
    }

    const authType = integration.auth_type || 'none';

    if (authType === 'bearer') {
      const token = authConfig.token || authConfig.credential;
      if (token) {
        const headerName = authConfig.header || 'Authorization';
        const prefix = authConfig.prefix !== undefined ? authConfig.prefix : 'Bearer';
        headers[headerName] = prefix ? `${prefix} ${token}` : token;
      }
    } else if (authType === 'api_key') {
      const key = authConfig.key || authConfig.credential;
      if (key) {
        const headerName = authConfig.header || authConfig.headerName || 'api_key';
        headers[headerName] = key;
      }
    } else if (authType === 'basic') {
      if (authConfig.username) {
        const creds = Buffer.from(`${authConfig.username}:${authConfig.password || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${creds}`;
      } else if (authConfig.credential) {
        const creds = String(authConfig.credential).includes(':')
          ? Buffer.from(authConfig.credential).toString('base64')
          : authConfig.credential;
        headers[authConfig.header || 'Authorization'] = `Basic ${creds}`;
      }
    } else if (authType === 'custom_header') {
      const val = authConfig.credential || authConfig.key || authConfig.token;
      if (val) {
        const headerName = authConfig.header || 'X-Custom-Header';
        const prefix = authConfig.prefix ? `${authConfig.prefix} ` : '';
        headers[headerName] = `${prefix}${val}`;
      }
    } else if (authType === 'oauth2') {
      const token = authConfig.token || authConfig.credential;
      if (token) {
        const headerName = authConfig.header || 'Authorization';
        const prefix = authConfig.prefix !== undefined ? authConfig.prefix : 'Bearer';
        headers[headerName] = prefix ? `${prefix} ${token}` : token;
      }
    }

    // 3. Sisipkan Path Params (misal: /pet/{petId} -> /pet/123)
    const passedArgs = { ...(args || {}) };
    const pathMatches = targetUrl.match(/\{([^}]+)\}/g) || [];

    for (const match of pathMatches) {
      const paramName = match.replace(/[{}]/g, '');
      if (passedArgs[paramName] !== undefined) {
        targetUrl = targetUrl.replace(match, encodeURIComponent(String(passedArgs[paramName])));
        delete passedArgs[paramName];
      }
    }

    // 4. Siapkan Body atau Query Params
    let requestBody: any = null;

    if (method === 'GET' || method === 'HEAD') {
      const urlObj = new URL(targetUrl);
      for (const [key, value] of Object.entries(passedArgs)) {
        if (value !== undefined && value !== null && value !== '') {
          urlObj.searchParams.append(key, String(value));
        }
      }
      targetUrl = urlObj.toString();
    } else {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(passedArgs);
    }

    // Validate the constructed URL before making the request
    const urlCheck = validateUrlSyntax(targetUrl);
    if (!urlCheck.safe) {
      recordSecurityEvent({
        eventType: 'SSRF_BLOCKED',
        userId: user.id,
        route: '/api/playground/execute',
        reason: 'SSRF blocked disallowed URL',
        metadata: { path: tool.path },
      });
      return NextResponse.json({
        success: false,
        status: 403,
        statusText: 'Forbidden',
        latencyMs: Math.round(performance.now() - startTime),
        error: 'URL destination is not allowed',
      }, { status: 403 });
    }

    // 5. Eksekusi Request ke API Asli (with SSRF-safe fetch)
    let fetchRes: Response;
    try {
      fetchRes = await safeFetch(targetUrl, {
        method,
        headers,
        body: requestBody,
      });
    } catch (err: any) {
      const isSsrf = err.message === 'URL destination is not allowed';
      if (isSsrf) {
        recordSecurityEvent({
          eventType: 'SSRF_BLOCKED',
          userId: user.id,
          route: '/api/playground/execute',
          reason: 'SSRF blocked destination',
          metadata: { path: tool.path },
        });
      }
      return NextResponse.json({
        success: false,
        status: 403,
        statusText: 'Forbidden',
        latencyMs: Math.round(performance.now() - startTime),
        error: isSsrf ? 'URL destination is not allowed' : 'Request to target URL failed',
      }, { status: 403 });
    }

    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    const contentType = fetchRes.headers.get('content-type') || '';
    const contentLength = parseInt(fetchRes.headers.get('content-length') || '0', 10);
    let responseData: any = null;

    if (contentLength > MAX_RESPONSE_BYTES) {
      responseData = '[Response too large]';
    } else if (contentType.includes('application/json')) {
      responseData = await fetchRes.json();
    } else {
      responseData = await fetchRes.text();
    }

    // Record Playground Tool Execution Audit Log
    recordExecutionLog({
      executionId,
      userId: user.id,
      toolName: tool.name,
      source: 'PLAYGROUND',
      status: fetchRes.ok ? 'SUCCESS' : 'FAILED',
      errorCategory: fetchRes.ok ? null : 'EXTERNAL_API',
      executionTimeMs: latencyMs,
      resultSize: contentLength > 0 ? contentLength : null,
      metadata: {
        method,
        status_code: fetchRes.status,
      },
    });

    // Redact sensitive headers from client response
    const safeSentHeaders: Record<string, string> = { ...headers };
    for (const key of Object.keys(safeSentHeaders)) {
      const lower = key.toLowerCase();
      if (
        lower === 'authorization' ||
        lower.includes('key') ||
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('auth') ||
        lower.includes('password')
      ) {
        safeSentHeaders[key] = '[REDACTED]';
      }
    }

    const response = NextResponse.json({
      success: fetchRes.ok,
      status: fetchRes.status,
      statusText: fetchRes.statusText,
      latencyMs,
      targetUrl,
      method,
      sentHeaders: safeSentHeaders,
      sentBody: passedArgs,
      response: responseData,
    });

    applyRateLimitHeaders(response, limitResult);
    return response;

  } catch (error: any) {
    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    if (currentUser && currentTool) {
      recordExecutionLog({
        executionId,
        userId: currentUser.id,
        toolName: currentTool.name,
        source: 'PLAYGROUND',
        status: 'FAILED',
        errorCategory: 'INTERNAL',
        executionTimeMs: latencyMs,
        metadata: {
          error_type: error?.name || 'Error',
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        status: 500,
        statusText: 'Internal Gateway Error',
        latencyMs,
        error: error.message || 'Terjadi kesalahan saat mengeksekusi request',
      },
      { status: 500 }
    );
  }
}
