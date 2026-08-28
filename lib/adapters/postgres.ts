// lib/adapters/postgres.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Pool, PoolConfig } from 'pg';

const QUERY_TIMEOUT_MS = 30_000;
const MAX_ROWS = 150;

interface PostgresCredentials {
  connectionString: string;
}

const poolCache = new Map<string, Pool>();

function getPool(connectionString: string): Pool {
  let pool = poolCache.get(connectionString);
  if (!pool) {
    const isCloudPostgres =
      connectionString.includes('supabase.co') ||
      connectionString.includes('neon.tech') ||
      connectionString.includes('pooler.supabase.com') ||
      connectionString.includes('aws') ||
      connectionString.includes('sslmode=require');

    const config: PoolConfig = {
      connectionString,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    };

    if (isCloudPostgres) {
      config.ssl = { rejectUnauthorized: false };
    }

    pool = new Pool(config);
    pool.on('error', (err) => {
      console.error('[postgres adapter] pool error:', err.message);
      poolCache.delete(connectionString);
    });
    poolCache.set(connectionString, pool);
  }
  return pool;
}

function sanitizeDbError(error: any): string {
  const msg = error?.message || 'Unknown database error';
  const sanitized = msg
    .replace(/postgresql:\/\/[^\s]+/gi, '[REDACTED_CONNECTION_STRING]')
    .replace(/password=[^\s&]+/gi, 'password=[REDACTED]')
    .replace(/host=[^\s&]+/gi, 'host=[REDACTED]');
  return sanitized;
}

export function registerTools(server: McpServer, credentials: PostgresCredentials) {
  const pool = getPool(credentials.connectionString);

  server.tool(
    'run_sql_query',
    'Execute a READ-ONLY SQL query on the PostgreSQL database. Only SELECT and read operations are allowed. Write operations (INSERT, UPDATE, DELETE, DROP, etc.) will be rejected by the database.',
    {
      sql: z.string().describe('SQL query to execute (read-only)'),
      params: z.array(z.any()).optional().describe('Optional array of parameters for parameterized queries'),
    },
    async ({ sql, params }) => {
      const client = await pool.connect();
      try {
        await client.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);
        await client.query('BEGIN READ ONLY');

        let result;
        try {
          result = await client.query(sql, params || []);
        } catch (queryError: any) {
          await client.query('ROLLBACK').catch(() => {});

          if (queryError.code === '25006') {
            return {
              content: [{ type: 'text' as const, text: 'Query rejected: read-only mode. Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are not allowed.' }],
              isError: true,
            };
          }

          if (queryError.code === '57014') {
            return {
              content: [{ type: 'text' as const, text: `Query cancelled: exceeded timeout of ${QUERY_TIMEOUT_MS / 1000} seconds.` }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text' as const, text: `Database Error: ${sanitizeDbError(queryError)}` }],
            isError: true,
          };
        }

        await client.query('COMMIT');

        if (result.rows) {
          const isTruncated = result.rows.length > MAX_ROWS;
          const rowsToReturn = isTruncated ? result.rows.slice(0, MAX_ROWS) : result.rows;

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    command: result.command,
                    totalRowCount: result.rowCount,
                    returnedRowCount: rowsToReturn.length,
                    isTruncated,
                    warning: isTruncated
                      ? `Output dibatasi ${MAX_ROWS} baris untuk mencegah token overflow. Gunakan LIMIT/OFFSET jika butuh data spesifik.`
                      : undefined,
                    rows: rowsToReturn,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `Query executed: ${result.command}, rows affected: ${result.rowCount}`,
            },
          ],
        };
      } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        return {
          content: [{ type: 'text' as const, text: `Database Error: ${sanitizeDbError(error)}` }],
          isError: true,
        };
      } finally {
        await client.query('RESET statement_timeout').catch(() => {});
        client.release();
      }
    }
  );

  server.tool(
    'list_tables',
    'List all tables and views in the PostgreSQL database',
    {
      schema: z.string().optional().default('public').describe('Schema name (default: public)'),
    },
    async ({ schema }) => {
      const client = await pool.connect();
      try {
        await client.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);
        const query = `
          SELECT table_name, table_type, table_schema
          FROM information_schema.tables
          WHERE table_schema = $1 AND table_type IN ('BASE TABLE', 'VIEW')
          ORDER BY table_type, table_name;
        `;
        const result = await client.query(query, [schema || 'public']);
        const tables = result.rows.map((row) => ({
          schema: row.table_schema,
          name: row.table_name,
          type: row.table_type === 'BASE TABLE' ? 'table' : 'view',
        }));

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(tables, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text' as const, text: `Database Error: ${sanitizeDbError(error)}` }],
          isError: true,
        };
      } finally {
        await client.query('RESET statement_timeout').catch(() => {});
        client.release();
      }
    }
  );

  server.tool(
    'describe_table',
    'Get detailed column definitions, data types, primary keys, and nullability for a specific table',
    {
      table_name: z.string().describe('Name of the table to inspect'),
      schema: z.string().optional().default('public').describe('Schema name (default: public)'),
    },
    async ({ table_name, schema }) => {
      const client = await pool.connect();
      try {
        await client.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);
        const query = `
          SELECT 
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default,
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT kcu.column_name, kcu.table_name, kcu.table_schema
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
          ) pk ON c.table_name = pk.table_name 
              AND c.table_schema = pk.table_schema 
              AND c.column_name = pk.column_name
          WHERE c.table_schema = $1 AND c.table_name = $2
          ORDER BY c.ordinal_position;
        `;

        const result = await client.query(query, [schema || 'public', table_name]);

        if (result.rows.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `Table '${table_name}' not found in schema '${schema || 'public'}'.` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  table: table_name,
                  schema: schema || 'public',
                  columns: result.rows,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text' as const, text: `Database Error: ${sanitizeDbError(error)}` }],
          isError: true,
        };
      } finally {
        await client.query('RESET statement_timeout').catch(() => {});
        client.release();
      }
    }
  );
}