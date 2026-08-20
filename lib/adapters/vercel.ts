// lib/adapters/vercel.ts

import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';

interface VercelCredentials {
  token: string;
  teamId?: string; // opsional
}

export function registerTools(server: McpServer, credentials: VercelCredentials) {
  const { token, teamId } = credentials;

  // Helper untuk membangun URL dengan teamId
  const buildUrl = (path: string) => {
    const url = new URL(`https://api.vercel.com${path}`);
    if (teamId) {
      url.searchParams.set('teamId', teamId);
    }
    return url.toString();
  };

  // Tool: get_deployments
  server.tool(
    'get_deployments',
    'List recent deployments on Vercel',
    {
      limit: z.number().optional().default(10).describe('Maximum number of deployments to return'),
      projectId: z.string().optional().describe('Filter by project ID'),
    },
    async ({ limit, projectId }) => {
      try {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        if (projectId) params.set('projectId', projectId);
        const url = buildUrl(`/v6/deployments?${params.toString()}`);
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(`Vercel API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const deployments = data.deployments?.map((d: any) => ({
          id: d.uid,
          name: d.name,
          state: d.state,
          created: d.created,
          url: d.url,
          projectId: d.projectId,
        })) || [];
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

  // Tool: trigger_redeploy
  server.tool(
    'trigger_redeploy',
    'Trigger a redeployment for a specific deployment ID on Vercel',
    {
      deploymentId: z.string().describe('ID of the deployment to redeploy'),
      projectId: z.string().optional().describe('Project ID (optional, inferred from deployment)'),
    },
    async ({ deploymentId, projectId }) => {
      try {
        // Langkah: dapatkan deployment yang ada, lalu buat deployment baru dengan konfigurasi yang sama
        // Kita gunakan endpoint /v12/deployments untuk create
        // Banyak cara: bisa juga menggunakan /v6/deployments/{id}/events? tetapi lebih mudah redeploy dengan clone
        // Di Vercel API, redeploy berarti membuat deployment baru dengan konfigurasi yang sama.
        // Kita perlu fetch deployment yang lama untuk mendapatkan konfigurasinya.
        // Untuk sederhana, kita gunakan endpoint /v6/deployments/{id} untuk mendapatkan deployment, lalu POST /v12/deployments dengan metadata yang sama.

        // 1. Dapatkan deployment yang ada
        const getUrl = buildUrl(`/v6/deployments/${deploymentId}`);
        const getResponse = await fetch(getUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!getResponse.ok) {
          throw new Error(`Failed to fetch deployment: ${getResponse.status}`);
        }
        const existing = await getResponse.json();

        // 2. Buat deployment baru berdasarkan yang lama
        const payload: any = {
          name: existing.name,
          projectId: projectId || existing.projectId,
          target: existing.target || 'production',
          // Tambahkan fields lain sesuai kebutuhan (gitSource, etc.)
        };
        // Jika ada gitSource, ikutkan
        if (existing.gitSource) {
          payload.gitSource = existing.gitSource;
        }

        const postUrl = buildUrl('/v12/deployments');
        const postResponse = await fetch(postUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!postResponse.ok) {
          const errText = await postResponse.text();
          throw new Error(`Vercel API error: ${postResponse.status} - ${errText}`);
        }
        const newDeployment = await postResponse.json();
        return {
          content: [
            {
              type: 'text',
              text: `Redeployment triggered. New deployment ID: ${newDeployment.id}\nURL: ${newDeployment.url}`,
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