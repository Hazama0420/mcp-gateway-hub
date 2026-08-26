// lib/adapters/postgres.ts
import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';
import { Pool, PoolConfig } from 'pg';

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

    // Tambahkan SSL bypass untuk database cloud modern
    if (isCloudPostgres) {
      config.ssl = { rejectUnauthorized: false };
    }

    pool = new Pool(config);
    pool.on('error', (err) => {
      console.error('[postgres adapter] pool error, membuang dari cache:', err.message);
      poolCache.delete(connectionString);
    });
    poolCache.set(connectionString, pool);
  }
  return pool;
}

export function registerTools(server: McpServer, credentials: PostgresCredentials) {
  const pool = getPool(credentials.connectionString);

  // 1. Tool: run_sql_query
  server.tool(
    'run_sql_query',
    'Execute a SQL query on the PostgreSQL database (supports SELECT, INSERT, UPDATE, DELETE, etc.)',
    {
      sql: z.string().describe('SQL query to execute'),
      params: z.array(z.any()).optional().describe('Optional array of parameters for parameterized queries'),
    },
    async ({ sql, params }) => {
      const client = await pool.connect();
      try {
        const result = await client.query(sql, params || []);

        if (result.rows) {
          const MAX_ROWS = 150;
          const isTruncated = result.rows.length > MAX_ROWS;
          const rowsToReturn = isTruncated ? result.rows.slice(0, MAX_ROWS) : result.rows;

          return {
            content: [
              {
                type: 'text',
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
              type: 'text',
              text: `Query executed: ${result.command}, rows affected: ${result.rowCount}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Database Error: ${error.message}` }],
          isError: true,
        };
      } finally {
        client.release();
      }
    }
  );

  // 2. Tool: list_tables
  server.tool(
    'list_tables',
    'List all tables and views in the PostgreSQL database',
    {
      schema: z.string().optional().default('public').describe('Schema name (default: public)'),
    },
    async ({ schema }) => {
      const client = await pool.connect();
      try {
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
          content: [{ type: 'text', text: JSON.stringify(tables, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Database Error: ${error.message}` }],
          isError: true,
        };
      } finally {
        client.release();
      }
    }
  );

  // 3. Tool: describe_table (Struktur Kolom & Tipe Data)
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
          throw new Error(`Table '${table_name}' tidak ditemukan pada schema '${schema || 'public'}'.`);
        }

        return {
          content: [
            {
              type: 'text',
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
          content: [{ type: 'text', text: `Database Error: ${error.message}` }],
          isError: true,
        };
      } finally {
        client.release();
      }
    }
  );
}