// app/api/integrations/import-openapi/route.ts
import { NextRequest, NextResponse } from 'next/server';
import YAML from 'yaml';

export const dynamic = 'force-dynamic';

function sanitizeToolName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 64);
}

function detectPermission(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
      return 'read';
    case 'DELETE':
      return 'delete';
    case 'POST':
    case 'PUT':
    case 'PATCH':
    default:
      return 'write';
  }
}

// Otomatis ubah URL GitHub biasa menjadi Raw file URL
function normalizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (url.includes('github.com') && url.includes('/blob/')) {
    url = url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
  }
  return url;
}

// Parser pintar: Coba JSON dulu, jika gagal coba parse sebagai YAML
function parseRawContent(rawText: string): any {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      return YAML.parse(trimmed);
    } catch {
      throw new Error(
        'Format spesifikasi tidak valid. Pastikan konten berupa JSON atau YAML OpenAPI yang benar.'
      );
    }
  }
}

function parseOpenApiSchema(spec: any) {
  if (!spec || typeof spec !== 'object') {
    throw new Error('Dokumen spesifikasi OpenAPI kosong atau tidak valid.');
  }

  // 1. Ekstrak Base URL (Mendukung OpenAPI 3.x & Swagger 2.0)
  let baseUrl = '';
  if (Array.isArray(spec.servers) && spec.servers.length > 0) {
    baseUrl = spec.servers[0].url || '';
  } else if (spec.host) {
    const scheme = (spec.schemes && spec.schemes[0]) || 'https';
    const basePath = spec.basePath || '';
    baseUrl = `${scheme}://${spec.host}${basePath}`;
  }

  // 2. Deteksi Autentikasi
  let authType = 'none';
  const secSchemes =
    spec.components?.securitySchemes || spec.securityDefinitions || {};
  for (const key in secSchemes) {
    const scheme = secSchemes[key];
    if (scheme.type === 'http' && scheme.scheme === 'bearer') {
      authType = 'bearer';
      break;
    } else if (scheme.type === 'apiKey') {
      authType = 'api_key';
      break;
    } else if (scheme.type === 'oauth2') {
      authType = 'oauth2';
      break;
    } else if (scheme.type === 'basic') {
      authType = 'basic';
      break;
    }
  }

  // 3. Ekstrak Endpoints menjadi Tool MCP
  const tools: any[] = [];
  const paths = spec.paths || {};
  const allowedMethods = ['get', 'post', 'put', 'delete', 'patch'];

  for (const path in paths) {
    const pathItem = paths[path];
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const method of allowedMethods) {
      if (!pathItem[method]) continue;

      const op = pathItem[method];
      const fallbackName = `${method}_${path}`;
      const toolName = sanitizeToolName(op.operationId || fallbackName);

      const properties: Record<string, any> = {};
      const requiredFields: string[] = [];

      // Parameter URL (query, path, header)
      const parameters = [
        ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
        ...(Array.isArray(op.parameters) ? op.parameters : []),
      ];

      for (const p of parameters) {
        if (!p || !p.name) continue;

        // Swagger 2.0 Body parameter
        if (p.in === 'body' && p.schema?.properties) {
          for (const propKey in p.schema.properties) {
            properties[propKey] = p.schema.properties[propKey];
          }
          if (Array.isArray(p.schema.required)) {
            requiredFields.push(...p.schema.required);
          }
          continue;
        }

        properties[p.name] = {
          type: p.schema?.type || p.type || 'string',
          description: p.description || `${p.name} parameter (${p.in || 'query'})`,
        };
        if (p.required) {
          requiredFields.push(p.name);
        }
      }

      // Request Body (OpenAPI 3.x)
      const requestBodySchema =
        op.requestBody?.content?.['application/json']?.schema;
      if (requestBodySchema && requestBodySchema.properties) {
        for (const propKey in requestBodySchema.properties) {
          properties[propKey] = requestBodySchema.properties[propKey];
        }
        if (Array.isArray(requestBodySchema.required)) {
          requiredFields.push(...requestBodySchema.required);
        }
      }

      const inputSchema = {
        type: 'object',
        properties,
        ...(requiredFields.length > 0
          ? { required: Array.from(new Set(requiredFields)) }
          : {}),
      };

      tools.push({
        name: toolName,
        description:
          op.summary ||
          op.description ||
          `Execute ${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path: path,
        permission: detectPermission(method),
        is_enabled: true,
        inputSchema: JSON.stringify(inputSchema, null, 2),
        headersTemplate: '{}',
        queryTemplate: '{}',
        bodyTemplate: '{}',
        responseMapping: '{}',
      });
    }
  }

  return {
    name: spec.info?.title || 'Imported API',
    slug: sanitizeToolName(spec.info?.title || 'imported_api'),
    description: spec.info?.description || '',
    baseUrl: baseUrl.replace(/\/+$/, ''),
    authType,
    tools,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, rawSpec } = body;

    let specData: any = null;

    if (url && typeof url === 'string') {
      const cleanUrl = normalizeUrl(url);

      const fetchRes = await fetch(cleanUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MCP-Gateway-Hub/1.0',
          Accept: 'application/json, application/yaml, text/yaml, text/plain, */*',
        },
      });

      if (!fetchRes.ok) {
        return NextResponse.json(
          {
            error: `Gagal mengambil URL (${fetchRes.status} ${fetchRes.statusText}). Pastikan URL publik dan mengarah ke file JSON/YAML spesifikasi.`,
          },
          { status: 400 }
        );
      }

      const text = await fetchRes.text();
      specData = parseRawContent(text);
    } else if (rawSpec) {
      specData =
        typeof rawSpec === 'string' ? parseRawContent(rawSpec) : rawSpec;
    } else {
      return NextResponse.json(
        {
          error:
            'Harap masukkan URL OpenAPI/Swagger atau paste JSON/YAML spesifikasi.',
        },
        { status: 400 }
      );
    }

    const parsed = parseOpenApiSchema(specData);
    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json(
      { error: `Gagal memproses OpenAPI: ${error.message}` },
      { status: 400 }
    );
  }
}