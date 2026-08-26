// app/api/playground/execute/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const startTime = performance.now();
  try {
    const { toolId, args } = await req.json();

    if (!toolId) {
      return NextResponse.json({ error: 'toolId wajib disertakan' }, { status: 400 });
    }

    // 1. Ambil data tool beserta config integrasinya
    const tool = await prisma.integrationTool.findUnique({
      where: { id: toolId },
      include: {
        integration: true,
      },
    });

    if (!tool) {
      return NextResponse.json({ error: 'Tool tidak ditemukan di database' }, { status: 404 });
    }

    const integration = tool.integration;
    const baseUrl = integration.base_url || '';
    
    // Bersihkan slash ganda pada URL
    let targetUrl = `${baseUrl.replace(/\/+$/, '')}/${tool.path.replace(/^\/+/, '')}`;
    const method = (tool.method || 'GET').toUpperCase();
    
    // 2. Siapkan Headers
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
    };

    // Parsing otentikasi dari auth_config (bertipe JSON di schema)
    const authConfig: any = typeof integration.auth_config === 'string' 
      ? JSON.parse(integration.auth_config) 
      : (integration.auth_config || {});
    
    const authType = integration.auth_type || 'none';

    if (authType === 'bearer' && authConfig.token) {
      headers['Authorization'] = `Bearer ${authConfig.token}`;
    } else if (authType === 'api_key' && authConfig.key) {
      const headerName = authConfig.headerName || 'api_key';
      headers[headerName] = authConfig.key;
    } else if (authType === 'basic' && authConfig.username) {
      const creds = Buffer.from(`${authConfig.username}:${authConfig.password || ''}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
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

    // 5. Eksekusi Request ke API Asli (misal: Petstore)
    const fetchRes = await fetch(targetUrl, {
      method,
      headers,
      body: requestBody,
    });

    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    const contentType = fetchRes.headers.get('content-type') || '';
    let responseData: any = null;

    if (contentType.includes('application/json')) {
      responseData = await fetchRes.json();
    } else {
      responseData = await fetchRes.text();
    }

    return NextResponse.json({
      success: fetchRes.ok,
      status: fetchRes.status,
      statusText: fetchRes.statusText,
      latencyMs,
      targetUrl,
      method,
      sentHeaders: headers,
      sentBody: passedArgs,
      response: responseData,
    });

  } catch (error: any) {
    const endTime = performance.now();
    return NextResponse.json(
      {
        success: false,
        status: 500,
        statusText: 'Internal Gateway Error',
        latencyMs: Math.round(endTime - startTime),
        error: error.message || 'Terjadi kesalahan saat mengeksekusi request',
      },
      { status: 500 }
    );
  }
}