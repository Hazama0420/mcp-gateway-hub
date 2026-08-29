// lib/mcpServer.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { decrypt } from './crypto';
import { recordExecutionLog, generateExecutionId } from './security/audit';
import { registerTools as registerGithub } from './adapters/github';
import { registerTools as registerPostgres } from './adapters/postgres';
import { registerTools as registerVercel } from './adapters/vercel';

export interface EndpointToolDefinition {
  name: string;
  description: string;
  service_type: string;
  input_schema: Record<string, any>;
}

export async function createMcpServer(endpoint: any, options?: { source?: 'MCP' | 'PLAYGROUND' }) {
  const source = options?.source || 'MCP';

  const server = new McpServer({
    name: 'MCP Gateway Hub',
    version: '1.0.0',
  });

  // Centralized Tool Execution Audit Wrapper
  const originalTool = server.tool.bind(server);
  server.tool = ((name: string, ...rest: any[]) => {
    const callback = rest[rest.length - 1];
    if (typeof callback === 'function') {
      rest[rest.length - 1] = async (...args: any[]) => {
        const startTime = performance.now();
        const executionId = generateExecutionId();
        try {
          const result = await callback(...args);
          const executionTimeMs = Math.round(performance.now() - startTime);
          const isError = Boolean(result && typeof result === 'object' && result.isError);

          let resultSize: number | null = null;
          if (result && Array.isArray(result.content)) {
            resultSize = result.content.reduce((acc: number, item: any) => acc + (item.text?.length || 0), 0);
          }

          // Non-blocking asynchronous audit log
          recordExecutionLog({
            executionId,
            endpointId: endpoint.id,
            userId: endpoint.user_id,
            toolName: name,
            source,
            status: isError ? 'FAILED' : 'SUCCESS',
            errorCategory: isError ? 'EXTERNAL_API' : null,
            executionTimeMs,
            resultSize,
            metadata: {
              adapter: name.split('_')[0] || 'mcp',
            },
          });

          return result;
        } catch (err: any) {
          const executionTimeMs = Math.round(performance.now() - startTime);
          recordExecutionLog({
            executionId,
            endpointId: endpoint.id,
            userId: endpoint.user_id,
            toolName: name,
            source,
            status: 'FAILED',
            errorCategory: 'INTERNAL',
            executionTimeMs,
            metadata: {
              error_type: err?.name || 'Error',
            },
          });
          throw err;
        }
      };
    }
    return (originalTool as any)(name, ...rest);
  }) as any;

  if (Array.isArray(endpoint.services)) {
    for (const service of endpoint.services) {
      try {
        const decryptedJson = decrypt(service.encrypted_config, service.iv, service.tag);
        const config = JSON.parse(decryptedJson);

        switch (service.service_type) {
          case 'github':
            registerGithub(server, { token: config.token });
            break;
          case 'supabase':
          case 'postgres':
          case 'postgresql':
            registerPostgres(server, { connectionString: config.connectionString });
            break;
          case 'vercel':
            registerVercel(server, { token: config.token, teamId: config.teamId });
            break;
        }
      } catch (error) {
        console.error('[HTTP] Error registering service:', service.service_type, error);
      }
    }
  }

  return server;
}

export async function getEndpointTools(endpoint: any): Promise<EndpointToolDefinition[]> {
  const server = await createMcpServer(endpoint, { source: 'PLAYGROUND' });
  const rawTools: Record<string, any> = (server as any)._registeredTools || {};

  const tools: EndpointToolDefinition[] = [];

  for (const [name, toolObj] of Object.entries(rawTools)) {
    let schemaJson: Record<string, any> = { properties: {} };
    try {
      if (toolObj.inputSchema) {
        if (toolObj.inputSchema instanceof z.ZodType) {
          schemaJson = (zodToJsonSchema(toolObj.inputSchema) as any) || { properties: {} };
        } else if (typeof toolObj.inputSchema === 'object') {
          try {
            schemaJson = (zodToJsonSchema(z.object(toolObj.inputSchema)) as any) || { properties: {} };
          } catch {
            schemaJson = { properties: toolObj.inputSchema };
          }
        }
      }
    } catch {
      schemaJson = { properties: {} };
    }

    // Determine service type from tool name prefix or attached services
    let serviceType = 'mcp';
    if (
      name.startsWith('list_repos') ||
      name.startsWith('get_repo') ||
      name.startsWith('list_issues') ||
      name.startsWith('create_issue') ||
      name.startsWith('get_file') ||
      name.startsWith('create_or_update') ||
      name.startsWith('list_pull')
    ) {
      serviceType = 'github';
    } else if (
      name.startsWith('run_sql') ||
      name.startsWith('list_tables') ||
      name.startsWith('describe_table')
    ) {
      serviceType = 'postgres';
    } else if (
      name.startsWith('list_projects') ||
      name.startsWith('get_project') ||
      name.startsWith('list_deployments') ||
      name.startsWith('get_deployment')
    ) {
      serviceType = 'vercel';
    }

    tools.push({
      name,
      description: toolObj.description || `Execute ${name} on MCP endpoint`,
      service_type: serviceType,
      input_schema: schemaJson,
    });
  }

  return tools;
}

export async function executeEndpointTool(
  endpoint: any,
  toolName: string,
  args: Record<string, any>,
  options?: { source?: 'MCP' | 'PLAYGROUND' }
) {
  const startTime = performance.now();

  if (!endpoint.is_active) {
    return {
      success: false,
      status: 400,
      statusText: 'ENDPOINT_INACTIVE',
      latencyMs: 0,
      error: 'This MCP Endpoint is currently paused/inactive. Please activate it before testing.',
    };
  }

  const server = await createMcpServer(endpoint, { source: options?.source || 'PLAYGROUND' });
  const rawTools: Record<string, any> = (server as any)._registeredTools || {};
  const targetTool = rawTools[toolName];

  if (!targetTool) {
    return {
      success: false,
      status: 404,
      statusText: 'NOT_FOUND',
      latencyMs: Math.round(performance.now() - startTime),
      error: `Tool "${toolName}" is not registered on this endpoint.`,
    };
  }

  try {
    const handler = targetTool.handler;
    const result = await handler(args, {});
    const latencyMs = Math.round(performance.now() - startTime);

    const isError = Boolean(result && typeof result === 'object' && result.isError);

    return {
      success: !isError,
      status: isError ? 500 : 200,
      statusText: isError ? 'Tool Execution Error' : 'OK',
      latencyMs,
      response: result,
      error: isError ? result?.content?.[0]?.text || 'Tool returned an error' : undefined,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      success: false,
      status: 500,
      statusText: 'Execution Exception',
      latencyMs,
      error: err.message || 'Error occurred while executing endpoint tool',
    };
  }
}

export async function createComboMcpServer(combo: any, options?: { source?: 'COMBO' | 'PLAYGROUND' }) {
  const source = options?.source || 'COMBO';

  const server = new McpServer({
    name: `Combo - ${combo.name}`,
    version: '1.0.0',
  });

  const originalTool = server.tool.bind(server);
  server.tool = ((name: string, ...rest: any[]) => {
    const callback = rest[rest.length - 1];
    if (typeof callback === 'function') {
      rest[rest.length - 1] = async (...args: any[]) => {
        const startTime = performance.now();
        const executionId = generateExecutionId();
        try {
          const result = await callback(...args);
          const executionTimeMs = Math.round(performance.now() - startTime);
          const isError = Boolean(result && typeof result === 'object' && result.isError);

          let resultSize: number | null = null;
          if (result && Array.isArray(result.content)) {
            resultSize = result.content.reduce((acc: number, item: any) => acc + (item.text?.length || 0), 0);
          }

          recordExecutionLog({
            executionId,
            endpointId: combo.id,
            userId: combo.user_id,
            toolName: name,
            source,
            status: isError ? 'FAILED' : 'SUCCESS',
            errorCategory: isError ? 'EXTERNAL_API' : null,
            executionTimeMs,
            resultSize,
            metadata: {
              adapter: name.split('_')[0] || 'combo',
              combo_id: combo.id,
              combo_name: combo.name,
            },
          });

          return result;
        } catch (err: any) {
          const executionTimeMs = Math.round(performance.now() - startTime);
          recordExecutionLog({
            executionId,
            endpointId: combo.id,
            userId: combo.user_id,
            toolName: name,
            source,
            status: 'FAILED',
            errorCategory: 'INTERNAL',
            executionTimeMs,
            metadata: {
              error_type: err?.name || 'Error',
              combo_id: combo.id,
            },
          });
          throw err;
        }
      };
    }
    return (originalTool as any)(name, ...rest);
  }) as any;

  if (Array.isArray(combo.endpoints)) {
    for (const link of combo.endpoints) {
      const ep = link.endpoint;
      if (ep && ep.is_active && Array.isArray(ep.services)) {
        for (const service of ep.services) {
          try {
            const decryptedJson = decrypt(service.encrypted_config, service.iv, service.tag);
            const config = JSON.parse(decryptedJson);

            switch (service.service_type) {
              case 'github':
                registerGithub(server, { token: config.token });
                break;
              case 'supabase':
              case 'postgres':
              case 'postgresql':
                registerPostgres(server, { connectionString: config.connectionString });
                break;
              case 'vercel':
                registerVercel(server, { token: config.token, teamId: config.teamId });
                break;
            }
          } catch (error) {
            console.error('[Combo Server] Error registering service:', service.service_type, error);
          }
        }
      }
    }
  }

  return server;
}

export async function getComboTools(combo: any): Promise<EndpointToolDefinition[]> {
  const server = await createComboMcpServer(combo, { source: 'PLAYGROUND' });
  const rawTools: Record<string, any> = (server as any)._registeredTools || {};

  const tools: EndpointToolDefinition[] = [];

  for (const [name, toolObj] of Object.entries(rawTools)) {
    let schemaJson: Record<string, any> = { properties: {} };
    try {
      if (toolObj.inputSchema) {
        if (toolObj.inputSchema instanceof z.ZodType) {
          schemaJson = (zodToJsonSchema(toolObj.inputSchema) as any) || { properties: {} };
        } else if (typeof toolObj.inputSchema === 'object') {
          try {
            schemaJson = (zodToJsonSchema(z.object(toolObj.inputSchema)) as any) || { properties: {} };
          } catch {
            schemaJson = { properties: toolObj.inputSchema };
          }
        }
      }
    } catch {
      schemaJson = { properties: {} };
    }

    let serviceType = 'combo';
    if (
      name.startsWith('list_repos') ||
      name.startsWith('list_directory') ||
      name.startsWith('get_file') ||
      name.startsWith('create_or_update') ||
      name.startsWith('create_issue')
    ) {
      serviceType = 'github';
    } else if (
      name.startsWith('run_sql') ||
      name.startsWith('list_tables') ||
      name.startsWith('describe_table')
    ) {
      serviceType = 'postgres';
    } else if (
      name.startsWith('list_projects') ||
      name.startsWith('get_deployments') ||
      name.startsWith('get_deployment_logs') ||
      name.startsWith('trigger_redeploy') ||
      name.startsWith('get_project_env')
    ) {
      serviceType = 'vercel';
    }

    tools.push({
      name,
      description: toolObj.description || `Execute ${name} on Combo`,
      service_type: serviceType,
      input_schema: schemaJson,
    });
  }

  return tools;
}

export async function executeComboTool(
  combo: any,
  toolName: string,
  args: Record<string, any>,
  options?: { source?: 'COMBO' | 'PLAYGROUND' }
) {
  const startTime = performance.now();

  if (!combo.is_active) {
    return {
      success: false,
      status: 400,
      statusText: 'COMBO_INACTIVE',
      latencyMs: 0,
      error: 'This Combo is currently paused/inactive. Please activate it before testing.',
    };
  }

  const server = await createComboMcpServer(combo, { source: options?.source || 'PLAYGROUND' });
  const rawTools: Record<string, any> = (server as any)._registeredTools || {};
  const targetTool = rawTools[toolName];

  if (!targetTool) {
    return {
      success: false,
      status: 404,
      statusText: 'NOT_FOUND',
      latencyMs: Math.round(performance.now() - startTime),
      error: `Tool "${toolName}" is not registered on this combo.`,
    };
  }

  try {
    const handler = targetTool.handler;
    const result = await handler(args, {});
    const latencyMs = Math.round(performance.now() - startTime);

    const isError = Boolean(result && typeof result === 'object' && result.isError);

    return {
      success: !isError,
      status: isError ? 500 : 200,
      statusText: isError ? 'Tool Execution Error' : 'OK',
      latencyMs,
      response: result,
      error: isError ? result?.content?.[0]?.text || 'Tool returned an error' : undefined,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      success: false,
      status: 500,
      statusText: 'Execution Exception',
      latencyMs,
      error: err.message || 'Error occurred while executing combo tool',
    };
  }
}

