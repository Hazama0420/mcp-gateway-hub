// lib/adapters/registry.ts

export type ServiceCategory =
  | 'All'
  | 'Developer Tools'
  | 'Databases'
  | 'Cloud'
  | 'APIs'
  | 'Custom';

export interface CredentialField {
  key: string;
  label: string;
  type: 'password' | 'text';
  placeholder: string;
  required: boolean;
  helpText?: string;
  defaultValue?: string;
}

export interface ServiceToolInfo {
  name: string;
  description: string;
  permission?: 'read' | 'write';
}

export interface ServiceDefinition {
  id: string;
  serviceType: string;
  name: string;
  description: string;
  category: ServiceCategory;
  theme: {
    color: string;
    bgLight: string;
    bgDark: string;
    border: string;
    badgeBg: string;
    badgeText: string;
  };
  toolsCount: number;
  tools: ServiceToolInfo[];
  credentialFields: CredentialField[];
  testable: boolean;
  supportsReadOnly?: boolean;
  isCustom?: boolean;
}

export const BUILTIN_SERVICES: ServiceDefinition[] = [
  {
    id: 'github',
    serviceType: 'github',
    name: 'GitHub',
    description: 'Repository, issue tracking, and file content management via GitHub REST API.',
    category: 'Developer Tools',
    theme: {
      color: '#8B5CF6',
      bgLight: 'bg-violet-50 dark:bg-violet-950/30',
      bgDark: 'dark:bg-violet-950/40',
      border: 'border-violet-300 dark:border-violet-700',
      badgeBg: 'bg-violet-100 dark:bg-violet-900/60',
      badgeText: 'text-violet-800 dark:text-violet-200',
    },
    toolsCount: 7,
    tools: [
      { name: 'list_repos', description: 'List public & private repositories for the authenticated user', permission: 'read' },
      { name: 'get_repo', description: 'Fetch repository metadata and status', permission: 'read' },
      { name: 'list_issues', description: 'List repository issues with filtering options', permission: 'read' },
      { name: 'create_issue', description: 'Create a new issue with title and body', permission: 'write' },
      { name: 'get_file', description: 'Read file contents from a repository at a specific branch or commit', permission: 'read' },
      { name: 'create_or_update_file', description: 'Commit and push file changes to a repository branch', permission: 'write' },
      { name: 'list_pull_requests', description: 'List open and closed pull requests', permission: 'read' },
    ],
    credentialFields: [
      {
        key: 'token',
        label: 'GitHub Personal Access Token',
        type: 'password',
        placeholder: 'ghp_...',
        required: true,
        helpText: 'Requires repo and issues permissions for repository management tools.',
      },
    ],
    testable: true,
  },
  {
    id: 'postgres',
    serviceType: 'postgres',
    name: 'PostgreSQL',
    description: 'Direct relational database access executed inside read-only transactions.',
    category: 'Databases',
    theme: {
      color: '#10B981',
      bgLight: 'bg-emerald-50 dark:bg-emerald-950/30',
      bgDark: 'dark:bg-emerald-950/40',
      border: 'border-emerald-300 dark:border-emerald-700',
      badgeBg: 'bg-emerald-100 dark:bg-emerald-900/60',
      badgeText: 'text-emerald-800 dark:text-emerald-200',
    },
    toolsCount: 3,
    tools: [
      { name: 'run_sql', description: 'Execute read-only SQL queries with automatic statement timeout', permission: 'read' },
      { name: 'list_tables', description: 'List public schema tables and table schemas', permission: 'read' },
      { name: 'describe_table', description: 'Inspect column definitions, types, and constraints of a table', permission: 'read' },
    ],
    credentialFields: [
      {
        key: 'connectionString',
        label: 'Database Connection String',
        type: 'password',
        placeholder: 'postgresql://postgres:password@host:5432/dbname',
        required: true,
        helpText: 'Strictly executed with BEGIN READ ONLY isolation and 10s query timeout.',
      },
    ],
    testable: true,
    supportsReadOnly: true,
  },
  {
    id: 'supabase',
    serviceType: 'supabase',
    name: 'Supabase',
    description: 'PostgreSQL connection pooling and schema inspection for Supabase cloud databases.',
    category: 'Databases',
    theme: {
      color: '#14B8A6',
      bgLight: 'bg-teal-50 dark:bg-teal-950/30',
      bgDark: 'dark:bg-teal-950/40',
      border: 'border-teal-300 dark:border-teal-700',
      badgeBg: 'bg-teal-100 dark:bg-teal-900/60',
      badgeText: 'text-teal-800 dark:text-teal-200',
    },
    toolsCount: 3,
    tools: [
      { name: 'run_sql', description: 'Execute read-only SQL queries against Supabase pooler or direct URI', permission: 'read' },
      { name: 'list_tables', description: 'List tables in the public database schema', permission: 'read' },
      { name: 'describe_table', description: 'Inspect table columns, primary keys, and data types', permission: 'read' },
    ],
    credentialFields: [
      {
        key: 'connectionString',
        label: 'Supabase Postgres URI',
        type: 'password',
        placeholder: 'postgres://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres',
        required: true,
        helpText: 'Use Session or Transaction pooler connection string with read-only transaction protection.',
      },
    ],
    testable: true,
    supportsReadOnly: true,
  },
  {
    id: 'vercel',
    serviceType: 'vercel',
    name: 'Vercel',
    description: 'Deployment status, project listings, and serverless logs via Vercel REST API.',
    category: 'Cloud',
    theme: {
      color: '#0EA5E9',
      bgLight: 'bg-sky-50 dark:bg-sky-950/30',
      bgDark: 'dark:bg-sky-950/40',
      border: 'border-sky-300 dark:border-sky-700',
      badgeBg: 'bg-sky-100 dark:bg-sky-900/60',
      badgeText: 'text-sky-800 dark:text-sky-200',
    },
    toolsCount: 4,
    tools: [
      { name: 'list_projects', description: 'List Vercel projects belonging to the user or team', permission: 'read' },
      { name: 'get_project', description: 'Fetch project configuration, framework, and domain links', permission: 'read' },
      { name: 'list_deployments', description: 'List recent deployments and build states', permission: 'read' },
      { name: 'get_deployment', description: 'Inspect specific deployment status and error diagnostics', permission: 'read' },
    ],
    credentialFields: [
      {
        key: 'token',
        label: 'Vercel API Bearer Token',
        type: 'password',
        placeholder: 'vercel_...',
        required: true,
        helpText: 'Personal access token from your Vercel Account Settings > Tokens.',
      },
      {
        key: 'teamId',
        label: 'Team ID (Optional)',
        type: 'text',
        placeholder: 'team_... (leave empty for personal account)',
        required: false,
        helpText: 'Specify team ID if querying team-owned Vercel deployments.',
      },
    ],
    testable: true,
  },
];

/**
 * Returns all built-in service definitions.
 */
export function getBuiltinServices(): ServiceDefinition[] {
  return BUILTIN_SERVICES;
}

/**
 * Looks up a service definition by ID or serviceType.
 */
export function getServiceById(idOrType: string): ServiceDefinition | undefined {
  return BUILTIN_SERVICES.find(
    (s) => s.id === idOrType || s.serviceType === idOrType
  );
}

/**
 * Transforms user-created custom integrations (OpenAPI / REST) into standard ServiceDefinitions.
 */
export function formatUserIntegrationAsService(integration: any): ServiceDefinition {
  const toolsCount = Array.isArray(integration.tools) ? integration.tools.length : 0;
  const toolsList: ServiceToolInfo[] = Array.isArray(integration.tools)
    ? integration.tools.map((t: any) => ({
        name: t.name,
        description: t.description || `Custom endpoint ${t.method} ${t.path}`,
        permission: (t.permission as 'read' | 'write') || 'read',
      }))
    : [];

  return {
    id: `custom_${integration.id}`,
    serviceType: 'custom',
    name: integration.name,
    description: integration.description || `Custom REST API: ${integration.base_url}`,
    category: 'Custom',
    theme: {
      color: '#F59E0B',
      bgLight: 'bg-amber-50 dark:bg-amber-950/30',
      bgDark: 'dark:bg-amber-950/40',
      border: 'border-amber-300 dark:border-amber-700',
      badgeBg: 'bg-amber-100 dark:bg-amber-900/60',
      badgeText: 'text-amber-800 dark:text-amber-200',
    },
    toolsCount,
    tools: toolsList,
    credentialFields: [],
    testable: false,
    isCustom: true,
  };
}

/**
 * Dynamically computes total tool count for a list of attached services based on registry definitions.
 */
export function calculateEndpointToolCount(services?: Array<{ service_type: string }> | null): number {
  if (!Array.isArray(services)) return 0;
  const serviceTypes = new Set(
    services.map((s) => s.service_type.toLowerCase())
  );

  let count = 0;
  for (const svc of BUILTIN_SERVICES) {
    const sType = svc.serviceType.toLowerCase();
    if (
      serviceTypes.has(sType) ||
      (sType === 'postgres' && (serviceTypes.has('postgresql') || serviceTypes.has('neon') || serviceTypes.has('supabase')))
    ) {
      count += svc.toolsCount || (svc.tools ? svc.tools.length : 0);
    }
  }
  return count;
}

