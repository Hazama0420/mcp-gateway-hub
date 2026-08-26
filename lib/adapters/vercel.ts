// lib/adapters/vercel.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

interface VercelCredentials {
  token: string;
  teamId?: string;
}

export function registerTools(server: McpServer, credentials: VercelCredentials) {
  const { token, teamId } = credentials;

  // Helper untuk membangun URL request dengan query params & teamId
  const buildUrl = (path: string, queryParams: Record<string, string | number | undefined> = {}) => {
    const url = new URL(`https://api.vercel.com${path}`);
    if (teamId) {
      url.searchParams.set('teamId', teamId);
    }
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  };

  const defaultHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Helper parse pesan error API Vercel
  const handleError = async (response: Response) => {
    const errData = await response.json().catch(() => null);
    const message = errData?.error?.message || errData?.message || response.statusText;
    throw new Error(`Vercel API error (${response.status}): ${message}`);
  };

  // 1. Tool: list_projects
  server.tool(
    'list_projects',
    'List all projects in the Vercel account or team',
    {
      limit: z.number().optional().default(20).describe('Maximum number of projects to return'),
      search: z.string().optional().describe('Search projects by name'),
    },
    async ({ limit, search }) => {
      try {
        const url = buildUrl('/v9/projects', { limit, search });
        const response = await fetch(url, { headers: defaultHeaders });

        if (!response.ok) await handleError(response);

        const data = await response.json();
        const projects = (data.projects || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          framework: p.framework,
          updatedAt: p.updatedAt,
          latestDeployments: p.latestDeployments?.map((d: any) => ({
            id: d.id,
            url: d.url,
            readyState: d.readyState,
          })),
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(projects, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 2. Tool: get_deployments
  server.tool(
    'get_deployments',
    'List recent deployments on Vercel with optional filters',
    {
      limit: z.number().optional().default(10).describe('Maximum number of deployments to return'),
      projectId: z.string().optional().describe('Filter by project ID or project name'),
      state: z.enum(['BUILDING', 'ERROR', 'INITIALIZING', 'QUEUED', 'READY', 'CANCELED']).optional().describe('Filter by deployment state'),
      target: z.enum(['production', 'staging', 'preview']).optional().describe('Filter by target environment'),
    },
    async ({ limit, projectId, state, target }) => {
      try {
        const url = buildUrl('/v6/deployments', {
          limit,
          projectId,
          state,
          target,
        });

        const response = await fetch(url, { headers: defaultHeaders });
        if (!response.ok) await handleError(response);

        const data = await response.json();
        const deployments = (data.deployments || []).map((d: any) => ({
          id: d.uid,
          name: d.name,
          state: d.state || d.readyState,
          created: d.created || d.createdAt,
          url: d.url,
          target: d.target,
          inspectorUrl: d.inspectorUrl,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(deployments, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 3. Tool: get_deployment_logs (Untuk Debugging Error Build / Runtime)
  server.tool(
    'get_deployment_logs',
    'Get build or runtime error logs for a specific deployment',
    {
      deploymentId: z.string().describe('Deployment ID or URL host (e.g. "dpl_xxx" or "my-app.vercel.app")'),
      direction: z.enum(['backward', 'forward']).optional().default('backward').describe('Log stream direction'),
      limit: z.number().optional().default(50).describe('Max log lines to fetch'),
    },
    async ({ deploymentId, direction, limit }) => {
      try {
        const url = buildUrl(`/v3/deployments/${deploymentId}/events`, {
          direction,
          limit,
        });

        const response = await fetch(url, { headers: defaultHeaders });
        if (!response.ok) await handleError(response);

        const events = await response.json();
        const logs = (Array.isArray(events) ? events : []).map((e: any) => ({
          type: e.type,
          created: e.created,
          text: e.text || e.payload?.text,
        }));

        return {
          content: [
            {
              type: 'text',
              text: logs.length > 0
                ? logs.map((l: any) => `[${new Date(l.created).toISOString()}] ${l.text}`).join('\n')
                : 'No logs found for this deployment.',
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 4. Tool: trigger_redeploy (Native V13 Redeploy)
  server.tool(
    'trigger_redeploy',
    'Trigger a fresh redeployment for a deployment on Vercel',
    {
      deploymentId: z.string().describe('ID of the deployment to redeploy (e.g. "dpl_xxx")'),
      target: z.enum(['production', 'preview']).optional().describe('Target environment override'),
    },
    async ({ deploymentId, target }) => {
      try {
        // Dapatkan info deployment awal
        const infoUrl = buildUrl(`/v13/deployments/${deploymentId}`);
        const infoRes = await fetch(infoUrl, { headers: defaultHeaders });
        if (!infoRes.ok) await handleError(infoRes);
        const existing = await infoRes.json();

        // Buat deployment baru mengkloning deployment lama via API v13
        const postUrl = buildUrl('/v13/deployments', { forceNew: '1' });
        const postResponse = await fetch(postUrl, {
          method: 'POST',
          headers: defaultHeaders,
          body: JSON.stringify({
            name: existing.name,
            deploymentId: existing.id,
            target: target || existing.target || 'production',
          }),
        });

        if (!postResponse.ok) await handleError(postResponse);

        const newDeployment = await postResponse.json();
        return {
          content: [
            {
              type: 'text',
              text: `Redeployment triggered successfully!\nNew Deployment ID: ${newDeployment.id}\nState: ${newDeployment.readyState || newDeployment.status}\nURL: https://${newDeployment.url}\nInspector: ${newDeployment.inspectorUrl || 'N/A'}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  // 5. Tool: get_project_env (Melihat Variable Konfigurasi Project)
  server.tool(
    'get_project_env',
    'List environment variable keys configured on a Vercel project (values masked for security)',
    {
      projectId: z.string().describe('Project ID or Project Name'),
    },
    async ({ projectId }) => {
      try {
        const url = buildUrl(`/v9/projects/${projectId}/env`);
        const response = await fetch(url, { headers: defaultHeaders });

        if (!response.ok) await handleError(response);

        const data = await response.json();
        const envs = (data.envs || []).map((e: any) => ({
          id: e.id,
          key: e.key,
          type: e.type,
          target: e.target, // ['production', 'preview', 'development']
          updatedAt: e.updatedAt,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(envs, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}