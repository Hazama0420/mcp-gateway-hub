// lib/security/audit.ts
import * as crypto from 'node:crypto';

export type LogStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'BLOCKED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AUTH_FAILED';

export type ErrorCategory =
  | 'VALIDATION'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'RATE_LIMIT'
  | 'SSRF'
  | 'DATABASE'
  | 'EXTERNAL_API'
  | 'TIMEOUT'
  | 'INTERNAL';

export type LogSource =
  | 'MCP'
  | 'PLAYGROUND'
  | 'CONTROL_PLANE'
  | 'SECURITY'
  | 'INTERNAL';

export type SecurityEventType =
  | 'AUTH_FAILED'
  | 'AUTH_SUCCESS'
  | 'ACCESS_DENIED'
  | 'RATE_LIMITED'
  | 'SSRF_BLOCKED'
  | 'TENANT_ACCESS_DENIED'
  | 'OAUTH_CLIENT_REGISTERED'
  | 'OAUTH_AUTHORIZATION_STARTED'
  | 'OAUTH_AUTHORIZATION_DENIED'
  | 'OAUTH_TOKEN_ISSUED'
  | 'OAUTH_TOKEN_REFRESHED'
  | 'OAUTH_TOKEN_REJECTED'
  | 'OAUTH_SCOPE_DENIED';

let prismaInstance: any = null;

function getPrismaClient() {
  if (!prismaInstance) {
    try {
      const mod = require('../prisma');
      prismaInstance = mod.default || mod.prisma || mod;
    } catch {
      try {
        const { PrismaClient } = require('@prisma/client');
        prismaInstance = new PrismaClient();
      } catch {
        prismaInstance = null;
      }
    }
  }
  return prismaInstance;
}

/**
 * Generates a unique, non-guessable execution ID (e.g. EX-01JABC...-4F8A).
 */
export function generateExecutionId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `EX-${timestamp}-${random}`;
}

/**
 * Sanitizes metadata to strictly prevent secret and sensitive data leakage.
 * Strips credentials, tokens, passwords, raw SQL, raw arguments, and connection strings.
 */
export function sanitizeAuditMetadata(data: any, depth = 0): any {
  if (data === null || data === undefined) return null;
  if (depth > 4) return '[MAX_DEPTH]';

  if (typeof data === 'string') {
    let sanitized = data
      .replace(/postgresql:\/\/[^\s]+/gi, '[REDACTED_CONNECTION_STRING]')
      .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/password=[^\s&]+/gi, 'password=[REDACTED]')
      .replace(/key=[^\s&]+/gi, 'key=[REDACTED]');

    // Truncate long strings to prevent log bloat
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 500) + '...[TRUNCATED]';
    }
    return sanitized;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.slice(0, 20).map((item) => sanitizeAuditMetadata(item, depth + 1));
  }

  if (typeof data === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      // Block sensitive key names
      if (
        lowerKey.includes('pass') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('cred') ||
        lowerKey.includes('cookie') ||
        lowerKey.includes('key') ||
        lowerKey.includes('verifier') ||
        lowerKey.includes('challenge') ||
        lowerKey === 'sql' ||
        lowerKey === 'query' ||
        lowerKey === 'body' ||
        lowerKey === 'headers' ||
        lowerKey === 'code'
      ) {
        clean[key] = '[REDACTED]';
      } else {
        clean[key] = sanitizeAuditMetadata(value, depth + 1);
      }
    }
    return clean;
  }

  return String(data);
}

/**
 * Persists an execution log record safely without failing the main execution flow.
 */
export async function recordExecutionLog(params: {
  executionId?: string;
  endpointId?: string | null;
  userId?: string | null;
  toolName: string;
  source?: LogSource;
  status: LogStatus;
  errorCategory?: ErrorCategory | null;
  executionTimeMs?: number;
  resultSize?: number | null;
  metadata?: Record<string, any> | null;
}): Promise<void> {
  try {
    const prisma = getPrismaClient();
    if (!prisma?.executionLog?.create) return;

    const safeMetadata = params.metadata ? sanitizeAuditMetadata(params.metadata) : null;
    const finalExecutionId = params.executionId || generateExecutionId();

    await prisma.executionLog.create({
      data: {
        execution_id: finalExecutionId,
        endpoint_id: params.endpointId || null,
        user_id: params.userId || null,
        tool_name: params.toolName,
        source: params.source || 'MCP',
        status: params.status,
        error_category: params.errorCategory || null,
        execution_time_ms: Math.max(0, Math.round(params.executionTimeMs || 0)),
        result_size: params.resultSize ?? null,
        metadata: safeMetadata,
      },
    });
  } catch (error) {
    // FAIL-SAFE: Audit log failure must NEVER crash or fail the main tool execution
    console.error('[AUDIT_LOG_ERROR] Failed to persist execution log:', (error as any)?.message);
  }
}

/**
 * Helper to record security incidents (rate limits, auth failures, SSRF blocks).
 */
export async function recordSecurityEvent(params: {
  eventType: SecurityEventType;
  endpointId?: string | null;
  userId?: string | null;
  route?: string;
  ip?: string;
  reason?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    let errorCategory: ErrorCategory = 'INTERNAL';
    let status: LogStatus = 'BLOCKED';

    switch (params.eventType) {
      case 'AUTH_FAILED':
      case 'OAUTH_TOKEN_REJECTED':
        errorCategory = 'AUTHENTICATION';
        status = 'AUTH_FAILED';
        break;
      case 'RATE_LIMITED':
        errorCategory = 'RATE_LIMIT';
        status = 'RATE_LIMITED';
        break;
      case 'SSRF_BLOCKED':
        errorCategory = 'SSRF';
        status = 'BLOCKED';
        break;
      case 'ACCESS_DENIED':
      case 'TENANT_ACCESS_DENIED':
      case 'OAUTH_AUTHORIZATION_DENIED':
      case 'OAUTH_SCOPE_DENIED':
        errorCategory = 'AUTHORIZATION';
        status = 'BLOCKED';
        break;
      case 'AUTH_SUCCESS':
      case 'OAUTH_CLIENT_REGISTERED':
      case 'OAUTH_AUTHORIZATION_STARTED':
      case 'OAUTH_TOKEN_ISSUED':
      case 'OAUTH_TOKEN_REFRESHED':
        errorCategory = 'AUTHENTICATION';
        status = 'SUCCESS';
        break;
    }

    const safeMeta: Record<string, any> = {
      event_type: params.eventType,
      route: params.route || 'unknown',
      ip: params.ip ? params.ip.replace(/:\d+$/, '') : 'unknown',
      reason: params.reason || params.eventType,
      ...(params.metadata ? sanitizeAuditMetadata(params.metadata) : {}),
    };

    await recordExecutionLog({
      endpointId: params.endpointId || null,
      userId: params.userId || null,
      toolName: `security:${params.eventType.toLowerCase()}`,
      source: 'SECURITY',
      status,
      errorCategory,
      executionTimeMs: 0,
      metadata: safeMeta,
    });
  } catch (error) {
    console.error('[SECURITY_EVENT_ERROR] Failed to persist security event:', (error as any)?.message);
  }
}

/**
 * Standardized, safe console logger without external framework overhead.
 */
export const logger = {
  info: (tag: string, message: string, meta?: Record<string, any>) => {
    const cleanMeta = meta ? sanitizeAuditMetadata(meta) : '';
    console.log(`[INFO][${tag}] ${message}`, cleanMeta);
  },
  warn: (tag: string, message: string, meta?: Record<string, any>) => {
    const cleanMeta = meta ? sanitizeAuditMetadata(meta) : '';
    console.warn(`[WARN][${tag}] ${message}`, cleanMeta);
  },
  error: (tag: string, message: string, meta?: Record<string, any>) => {
    const cleanMeta = meta ? sanitizeAuditMetadata(meta) : '';
    console.error(`[ERROR][${tag}] ${message}`, cleanMeta);
  },
  security: (tag: string, message: string, meta?: Record<string, any>) => {
    const cleanMeta = meta ? sanitizeAuditMetadata(meta) : '';
    console.warn(`[SECURITY][${tag}] ${message}`, cleanMeta);
  },
};
