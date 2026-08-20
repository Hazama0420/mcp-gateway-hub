// lib/adapters/postgres.ts
import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';
import { Pool } from 'pg';

interface PostgresCredentials {
  connectionString: string;
}

// Cache pool per connection string. Tanpa ini, setiap kali registerTools()
// dipanggil (misal: tiap ada SSE session baru dari user/Inspector/Gemini),
// akan membuka pool koneksi Postgres baru yang tidak pernah ditutup —
// connection limit Neon/Supabase bisa cepat habis.
const poolCache = new Map<string, Pool>();

function getPool(connectionString: string): Pool {
  let pool = poolCache.get(connectionString);
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 3, // kecil karena tiap adapter instance bisa hidup berbarengan di serverless
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
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

  // Tool: run_sql_query
  server.tool(
    'run_sql_query',
    'Execute a SQL query on the PostgreSQL database',
    {
      sql: z.string().describe('SQL query to execute (SELECT, INSERT, UPDATE, DELETE, etc.)'),
      params: z.array(z.any()).optional().describe('Array of parameter values for parameterized query'),
    },
    async ({ sql, params }) => {
      const client = await pool.connect();
      try {
        const result = await client.query(sql, params || []);
        if (result.rows) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { rows: result.rows, rowCount: result.rowCount, command: result.command },
                  null,
                  2
                ),
              },
            ],
          };
        }
        return {
          content: [
            { type: 'text', text: `Query executed: ${result.command}, rows affected: ${result.rowCount}` },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      } finally {
        client.release();
      }
    }
  );

  // Tool: list_tables
  server.tool(
    'list_tables',
    'List all tables in the current PostgreSQL database',
    {
      schema: z.string().optional().describe('Schema name (default: public)'),
    },
    async ({ schema }) => {
      const client = await pool.connect();
      try {
        const query = `
          SELECT table_name, table_schema
          FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'
          ORDER BY table_schema, table_name;
        `;
        const result = await client.query(query, [schema || 'public']);
        const tables = result.rows.map((row) => ({
          schema: row.table_schema,
          name: row.table_name,
        }));
        return {
          content: [{ type: 'text', text: JSON.stringify(tables, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      } finally {
        client.release();
      }
    }
  );
}