// lib/mcpServer.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { createMcpServer } from '@/pages/api/mcp/[id]/http';

export { createMcpServer };

export interface EndpointToolDefinition {
  name: string;
  description: string;
  service_type: string;
  input_schema: Record<string, any>;
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
          // If shape object, wrap in z.object
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
