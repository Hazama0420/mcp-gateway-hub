'use client';

import {
  useEffect,
  useState,
  type ElementType,
  type FormEvent,
} from 'react';

import {
  Activity,
  Check,
  ChevronDown,
  ChevronUp,
  Database,
  Globe2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Server,
  Shield,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import {
  AppNavigation,
  MobileNavigation,
} from '@/components/AppNavigation';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

interface IntegrationTool {
  id?: string;
  name: string;
  description: string | null;
  method: string;
  path: string;
  permission: string;
  is_enabled: boolean;
  input_schema: Record<string, unknown> | null;
  headers_template: Record<string, unknown> | null;
  query_template: Record<string, unknown> | null;
  body_template: Record<string, unknown> | null;
  response_mapping: Record<string, unknown> | null;
}

interface Integration {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  base_url: string;
  auth_type: string;
  auth_config: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  tools: IntegrationTool[];
}

interface ToolForm {
  id?: string;
  name: string;
  description: string;
  method: string;
  path: string;
  permission: string;
  is_enabled: boolean;

  inputSchema: string;
  headersTemplate: string;
  queryTemplate: string;
  bodyTemplate: string;
  responseMapping: string;
}

const createEmptyTool = (): ToolForm => ({
  name: '',
  description: '',
  method: 'GET',
  path: '',
  permission: 'read',
  is_enabled: true,

  inputSchema: '{}',
  headersTemplate: '{}',
  queryTemplate: '{}',
  bodyTemplate: '{}',
  responseMapping: '{}',
});

const categoryOptions = [
  'development',
  'productivity',
  'communication',
  'database',
  'cloud',
  'crm',
  'commerce',
  'finance',
  'other',
];

const permissionOptions = [
  {
    value: 'read',
    label: 'Read',
  },
  {
    value: 'write',
    label: 'Write',
  },
  {
    value: 'delete',
    label: 'Delete',
  },
  {
    value: 'admin',
    label: 'Admin',
  },
];

const methodOptions = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
];

const authOptions = [
  {
    value: 'none',
    label: 'No authentication',
  },
  {
    value: 'api_key',
    label: 'API Key',
  },
  {
    value: 'bearer',
    label: 'Bearer Token',
  },
  {
    value: 'basic',
    label: 'Basic Auth',
  },
  {
    value: 'oauth2',
    label: 'OAuth 2.0',
  },
  {
    value: 'custom_header',
    label: 'Custom Header',
  },
];

const iconOptions = [
  {
    value: 'globe',
    label: 'API',
  },
  {
    value: 'github',
    label: 'GitHub',
  },
  {
    value: 'database',
    label: 'Database',
  },
  {
    value: 'server',
    label: 'Server',
  },
  {
    value: 'zap',
    label: 'Automation',
  },
];

export default function IntegrationsAdminPage() {
  const [integrations, setIntegrations] = useState<
    Integration[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');

  const [showBuilder, setShowBuilder] =
    useState(false);

  const [selectedIntegration, setSelectedIntegration] =
    useState<Integration | null>(null);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [category, setCategory] =
    useState('development');
  const [icon, setIcon] =
    useState('globe');
  const [description, setDescription] =
    useState('');

  const [baseUrl, setBaseUrl] =
    useState('');

  const [authType, setAuthType] =
    useState('none');

  const [credential, setCredential] =
    useState('');

  const [authHeader, setAuthHeader] =
    useState('Authorization');

  const [authPrefix, setAuthPrefix] =
    useState('Bearer');

  const [tools, setTools] =
    useState<ToolForm[]>([
      createEmptyTool(),
    ]);

  const [advancedOpen, setAdvancedOpen] =
    useState(false);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);

      const response = await fetch(
        '/api/integrations',
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        throw new Error(
          'Failed to load integrations'
        );
      }

      const data =
        await response.json();

      setIntegrations(
        Array.isArray(data)
          ? data
          : []
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load integrations'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const resetBuilder = () => {
    setSelectedIntegration(null);

    setName('');
    setSlug('');
    setCategory('development');
    setIcon('globe');
    setDescription('');

    setBaseUrl('');

    setAuthType('none');
    setCredential('');
    setAuthHeader('Authorization');
    setAuthPrefix('Bearer');

    setTools([
      createEmptyTool(),
    ]);

    setAdvancedOpen(false);

    setError(null);
    setSuccess(null);
  };

  const openCreate = () => {
    resetBuilder();
    setShowBuilder(true);
  };

  const openEdit = (
    integration: Integration
  ) => {
    setSelectedIntegration(
      integration
    );

    setName(integration.name);
    setSlug(integration.slug);

    setCategory(
      integration.category ||
        'development'
    );

    setIcon(
      integration.icon || 'globe'
    );

    setDescription(
      integration.description || ''
    );

    setBaseUrl(
      integration.base_url
    );

    setAuthType(
      integration.auth_type ||
        'none'
    );

    setCredential('');

    const authConfig =
      integration.auth_config;

    if (authConfig) {
      if (
        typeof authConfig.header ===
        'string'
      ) {
        setAuthHeader(
          authConfig.header
        );
      }

      if (
        typeof authConfig.prefix ===
        'string'
      ) {
        setAuthPrefix(
          authConfig.prefix
        );
      }
    } else {
      setAuthHeader(
        'Authorization'
      );
      setAuthPrefix('Bearer');
    }

    setTools(
      integration.tools.length > 0
        ? integration.tools.map(
            (tool) => ({
              id: tool.id,

              name: tool.name,

              description:
                tool.description || '',

              method:
                tool.method ||
                'GET',

              path:
                tool.path || '',

              permission:
                tool.permission ||
                'read',

              is_enabled:
                tool.is_enabled,

              inputSchema:
                tool.input_schema
                  ? JSON.stringify(
                      tool.input_schema,
                      null,
                      2
                    )
                  : '{}',

              headersTemplate:
                tool.headers_template
                  ? JSON.stringify(
                      tool.headers_template,
                      null,
                      2
                    )
                  : '{}',

              queryTemplate:
                tool.query_template
                  ? JSON.stringify(
                      tool.query_template,
                      null,
                      2
                    )
                  : '{}',

              bodyTemplate:
                tool.body_template
                  ? JSON.stringify(
                      tool.body_template,
                      null,
                      2
                    )
                  : '{}',

              responseMapping:
                tool.response_mapping
                  ? JSON.stringify(
                      tool.response_mapping,
                      null,
                      2
                    )
                  : '{}',
            })
          )
        : [createEmptyTool()]
    );

    setAdvancedOpen(false);
    setError(null);
    setSuccess(null);
    setShowBuilder(true);
  };

  const closeBuilder = () => {
    if (saving) {
      return;
    }

    setShowBuilder(false);
    resetBuilder();
  };

  const updateTool = (
    index: number,
    field: keyof ToolForm,
    value: string | boolean
  ) => {
    setTools((current) =>
      current.map(
        (tool, toolIndex) =>
          toolIndex === index
            ? {
                ...tool,
                [field]: value,
              }
            : tool
      )
    );
  };

  const addTool = () => {
    setTools((current) => [
      ...current,
      createEmptyTool(),
    ]);
  };

  const removeTool = (
    index: number
  ) => {
    setTools((current) => {
      if (current.length === 1) {
        return [
          createEmptyTool(),
        ];
      }

      return current.filter(
        (_, toolIndex) =>
          toolIndex !== index
      );
    });
  };

  const buildAuthConfig = () => {
    switch (authType) {
      case 'api_key':
        return {
          header:
            authHeader ||
            'X-API-Key',
          prefix: '',
        };

      case 'bearer':
        return {
          header:
            authHeader ||
            'Authorization',
          prefix:
            authPrefix ||
            'Bearer',
        };

      case 'basic':
        return {
          header:
            authHeader ||
            'Authorization',
          prefix: 'Basic',
        };

      case 'custom_header':
        return {
          header:
            authHeader ||
            'X-API-Key',
          prefix: authPrefix || '',
        };

      case 'oauth2':
        return {
          header:
            authHeader ||
            'Authorization',
          prefix:
            authPrefix ||
            'Bearer',
        };

      default:
        return {};
    }
  };

  const parseAdvancedJson = (
    value: string,
    label: string
  ) => {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(
        `${label} contains invalid JSON.`
      );
    }
  };

  const buildToolPayload = (
    tool: ToolForm
  ) => {
    if (!tool.name.trim()) {
      throw new Error(
        'Every tool must have a name.'
      );
    }

    if (!tool.path.trim()) {
      throw new Error(
        `Tool "${tool.name}" needs an API path.`
      );
    }

    return {
      name:
        tool.name.trim(),

      description:
        tool.description.trim() ||
        null,

      method:
        tool.method.toUpperCase(),

      path:
        tool.path.trim(),

      permission:
        tool.permission,

      is_enabled:
        tool.is_enabled,

      input_schema:
        parseAdvancedJson(
          tool.inputSchema,
          `Input schema for "${tool.name}"`
        ),

      headers_template:
        parseAdvancedJson(
          tool.headersTemplate,
          `Headers template for "${tool.name}"`
        ),

      query_template:
        parseAdvancedJson(
          tool.queryTemplate,
          `Query template for "${tool.name}"`
        ),

      body_template:
        parseAdvancedJson(
          tool.bodyTemplate,
          `Body template for "${tool.name}"`
        ),

      response_mapping:
        parseAdvancedJson(
          tool.responseMapping,
          `Response mapping for "${tool.name}"`
        ),
    };
  };

  const handleSubmit = async (
    event: FormEvent
  ) => {
    event.preventDefault();

    setError(null);
    setSuccess(null);

    if (!name.trim()) {
      setError(
        'Please enter an integration name.'
      );
      return;
    }

    if (!baseUrl.trim()) {
      setError(
        'Please enter the API Base URL.'
      );
      return;
    }

    if (
      authType !== 'none' &&
      !selectedIntegration &&
      !credential.trim()
    ) {
      setError(
        'Please enter the credential for this integration.'
      );
      return;
    }

    let toolPayload:
      | ReturnType<
          typeof buildToolPayload
        >[]
      | undefined;

    try {
      toolPayload =
        tools.map(
          buildToolPayload
        );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid tool configuration.'
      );
      return;
    }

    setSaving(true);

    try {
      const isEditing =
        Boolean(selectedIntegration);

      const endpoint =
        isEditing
          ? `/api/integrations/${selectedIntegration?.id}`
          : '/api/integrations';

      const method =
        isEditing
          ? 'PUT'
          : 'POST';

      const authConfig =
        buildAuthConfig();

      const mergedAuthConfig =
        credential.trim()
          ? {
              ...authConfig,
              credential:
                credential.trim(),
            }
          : authConfig;

      const payload = {
        name:
          name.trim(),

        slug:
          slug.trim() ||
          name.trim(),

        description:
          description.trim() ||
          null,

        icon,
        category,

        base_url:
          baseUrl
            .trim()
            .replace(
              /\/+$/,
              ''
            ),

        auth_type:
          authType,

        auth_config:
          mergedAuthConfig,

        is_active: true,

        tools:
          isEditing
            ? undefined
            : toolPayload,
      };

      const response =
        await fetch(
          endpoint,
          {
            method,

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );

      const data =
        await response
          .json()
          .catch(
            () => null
          );

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Failed to save integration.'
        );
      }

      await fetchIntegrations();

      setSuccess(
        isEditing
          ? 'Integration updated successfully.'
          : 'Integration created successfully.'
      );

      window.setTimeout(() => {
        setShowBuilder(false);
        resetBuilder();
      }, 700);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save integration.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (
    integration: Integration
  ) => {
    const confirmed =
      window.confirm(
        `Delete "${integration.name}"?`
      );

    if (!confirmed) {
      return;
    }

    setDeletingId(
      integration.id
    );

    try {
      const response =
        await fetch(
          `/api/integrations/${integration.id}`,
          {
            method: 'DELETE',
          }
        );

      const data =
        await response
          .json()
          .catch(
            () => null
          );

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Failed to delete integration.'
        );
      }

      setIntegrations(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              integration.id
          )
      );

      if (
        selectedIntegration?.id ===
        integration.id
      ) {
        closeBuilder();
      }
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : 'Failed to delete integration.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const filteredIntegrations =
    integrations.filter(
      (integration) => {
        const query =
          search
            .trim()
            .toLowerCase();

        if (!query) {
          return true;
        }

        return (
          integration.name
            .toLowerCase()
            .includes(query) ||
          integration.slug
            .toLowerCase()
            .includes(query) ||
          (
            integration.category ||
            ''
          )
            .toLowerCase()
            .includes(query)
        );
      }
    );

  return (
    <div className="min-h-screen bg-[#060b10] text-white">
      <div className="flex min-h-screen">
        <AppNavigation />

        <div className="min-w-0 flex-1">
          <MobileNavigation />

          <div className="relative">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
              <div className="absolute left-[-10%] top-[-10%] h-[420px] w-[420px] rounded-full bg-emerald-500/10 blur-[120px]" />

              <div className="absolute right-[-10%] top-[5%] h-[360px] w-[360px] rounded-full bg-cyan-500/10 blur-[120px]" />
            </div>

            <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

                    Admin

                    <span className="text-slate-700">
                      /
                    </span>

                    Integrations
                  </div>

                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Integrations
                  </h1>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    Connect APIs to your MCP
                    Gateway without writing a new
                    adapter.
                  </p>
                </div>

                <Button
                  onClick={openCreate}
                  className="h-11 rounded-xl bg-emerald-500 px-5 text-slate-950 hover:bg-emerald-400"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Integration
                </Button>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <MetricCard
                  label="Integrations"
                  value={
                    integrations.length
                  }
                  icon={Server}
                />

                <MetricCard
                  label="Active"
                  value={
                    integrations.filter(
                      (item) =>
                        item.is_active
                    ).length
                  }
                  icon={Zap}
                />

                <MetricCard
                  label="Available Tools"
                  value={integrations.reduce(
                    (
                      total,
                      item
                    ) =>
                      total +
                      item.tools.length,
                    0
                  )}
                  icon={Activity}
                />
              </div>

              <Card className="overflow-hidden rounded-3xl border-white/[0.07] bg-white/[0.025] backdrop-blur-xl">
                <CardHeader className="border-b border-white/[0.06] px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="text-lg text-white">
                        Integration Library
                      </CardTitle>

                      <p className="mt-1 text-sm text-slate-600">
                        Applications that can be
                        connected to MCP endpoints.
                      </p>
                    </div>

                    <div className="relative w-full max-w-sm">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />

                      <Input
                        value={search}
                        onChange={(event) =>
                          setSearch(
                            event.target
                              .value
                          )
                        }
                        placeholder="Search integrations..."
                        className="h-10 rounded-xl border-white/[0.08] bg-black/20 pl-9 text-slate-300 placeholder:text-slate-700"
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  {loading ? (
                    <div className="grid gap-4 p-6 md:grid-cols-2">
                      <IntegrationSkeleton />
                      <IntegrationSkeleton />
                      <IntegrationSkeleton />
                      <IntegrationSkeleton />
                    </div>
                  ) : filteredIntegrations.length ===
                    0 ? (
                    <EmptyIntegrationState
                      onCreate={
                        openCreate
                      }
                    />
                  ) : (
                    <div className="grid gap-4 p-6 md:grid-cols-2">
                      {filteredIntegrations.map(
                        (
                          integration
                        ) => (
                          <IntegrationCard
                            key={
                              integration.id
                            }
                            integration={
                              integration
                            }
                            deleting={
                              deletingId ===
                              integration.id
                            }
                            onEdit={() =>
                              openEdit(
                                integration
                              )
                            }
                            onDelete={() =>
                              handleDelete(
                                integration
                              )
                            }
                          />
                        )
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </main>

            {showBuilder && (
              <IntegrationBuilder
                editing={
                  selectedIntegration
                }
                name={name}
                slug={slug}
                category={category}
                icon={icon}
                description={
                  description
                }
                baseUrl={baseUrl}
                authType={authType}
                credential={
                  credential
                }
                authHeader={
                  authHeader
                }
                authPrefix={
                  authPrefix
                }
                tools={tools}
                advancedOpen={
                  advancedOpen
                }
                saving={saving}
                error={error}
                success={success}
                onClose={
                  closeBuilder
                }
                onSubmit={
                  handleSubmit
                }
                setName={setName}
                setSlug={setSlug}
                setCategory={
                  setCategory
                }
                setIcon={setIcon}
                setDescription={
                  setDescription
                }
                setBaseUrl={
                  setBaseUrl
                }
                setAuthType={
                  setAuthType
                }
                setCredential={
                  setCredential
                }
                setAuthHeader={
                  setAuthHeader
                }
                setAuthPrefix={
                  setAuthPrefix
                }
                setAdvancedOpen={
                  setAdvancedOpen
                }
                updateTool={
                  updateTool
                }
                addTool={addTool}
                removeTool={
                  removeTool
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: ElementType;
}) {
  return (
    <Card className="rounded-2xl border-white/[0.07] bg-white/[0.025]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-600">
              {label}
            </p>

            <p className="mt-2 text-3xl font-semibold text-white">
              {value}
            </p>
          </div>

          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
            <Icon className="h-5 w-5 text-emerald-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationCard({
  integration,
  deleting,
  onEdit,
  onDelete,
}: {
  integration: Integration;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="group rounded-2xl border-white/[0.07] bg-black/10 transition hover:border-emerald-500/20 hover:bg-white/[0.03]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <IntegrationIcon
              icon={
                integration.icon ||
                'globe'
              }
            />

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold text-white">
                  {integration.name}
                </h3>

                <Badge
                  className={
                    integration.is_active
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border-white/[0.07] bg-white/[0.03] text-slate-600'
                  }
                >
                  {integration.is_active
                    ? 'Active'
                    : 'Disabled'}
                </Badge>
              </div>

              <p className="mt-1 font-mono text-xs text-slate-700">
                {integration.slug}
              </p>

              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                {integration.description ||
                  'No description provided.'}
              </p>
            </div>
          </div>

          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              className="rounded-xl text-slate-600 hover:bg-white/[0.05] hover:text-white"
            >
              <Pencil className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              disabled={deleting}
              onClick={onDelete}
              className="rounded-xl text-slate-600 hover:bg-red-500/10 hover:text-red-400"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Globe2 className="h-3.5 w-3.5 text-slate-600" />

            <span className="truncate">
              {integration.base_url}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className="border-white/[0.07] text-slate-600"
          >
            {integration.auth_type}
          </Badge>

          <Badge
            variant="outline"
            className="border-white/[0.07] text-slate-600"
          >
            {integration.tools.length}{' '}
            tools
          </Badge>

          {integration.category && (
            <Badge
              variant="outline"
              className="border-white/[0.07] text-slate-600"
            >
              {integration.category}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationIcon({
  icon,
}: {
  icon: string;
}) {
  const Icon =
    icon === 'github'
      ? GithubIcon
      : icon === 'database'
        ? Database
        : icon === 'server'
          ? Server
          : icon === 'zap'
            ? Zap
            : Globe2;

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/10 bg-emerald-500/[0.05]">
      <Icon className="h-5 w-5 text-emerald-400" />
    </div>
  );
}

function IntegrationBuilder({
  editing,
  name,
  slug,
  category,
  icon,
  description,
  baseUrl,
  authType,
  credential,
  authHeader,
  authPrefix,
  tools,
  advancedOpen,
  saving,
  error,
  success,
  onClose,
  onSubmit,
  setName,
  setSlug,
  setCategory,
  setIcon,
  setDescription,
  setBaseUrl,
  setAuthType,
  setCredential,
  setAuthHeader,
  setAuthPrefix,
  setAdvancedOpen,
  updateTool,
  addTool,
  removeTool,
}: {
  editing: Integration | null;
  name: string;
  slug: string;
  category: string;
  icon: string;
  description: string;
  baseUrl: string;
  authType: string;
  credential: string;
  authHeader: string;
  authPrefix: string;
  tools: ToolForm[];
  advancedOpen: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  onClose: () => void;
  onSubmit: (
    event: FormEvent
  ) => void;

  setName: (
    value: string
  ) => void;

  setSlug: (
    value: string
  ) => void;

  setCategory: (
    value: string
  ) => void;

  setIcon: (
    value: string
  ) => void;

  setDescription: (
    value: string
  ) => void;

  setBaseUrl: (
    value: string
  ) => void;

  setAuthType: (
    value: string
  ) => void;

  setCredential: (
    value: string
  ) => void;

  setAuthHeader: (
    value: string
  ) => void;

  setAuthPrefix: (
    value: string
  ) => void;

  setAdvancedOpen: (
    value: boolean
  ) => void;

  updateTool: (
    index: number,
    field: keyof ToolForm,
    value: string | boolean
  ) => void;

  addTool: () => void;

  removeTool: (
    index: number
  ) => void;
}) {
  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        aria-label="Close builder"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col border-l border-white/[0.08] bg-[#080e14] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Integration
            </div>

            <h2 className="font-semibold text-white">
              {editing
                ? 'Edit Integration'
                : 'Create Integration'}
            </h2>

            <p className="mt-1 text-xs text-slate-600">
              Connect an API to your MCP Gateway.
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl text-slate-600 hover:bg-white/[0.05] hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ScrollArea className="flex-1">
            <div className="space-y-7 p-6">
              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
                  <Check className="h-4 w-4" />

                  {success}
                </div>
              )}

              <BuilderSection
                number="01"
                title="Basic"
                description="Tell us what this integration is."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Integration Name"
                    required
                  >
                    <Input
                      value={name}
                      onChange={(event) =>
                        setName(
                          event.target
                            .value
                        )
                      }
                      placeholder="Todoist"
                      className="bg-black/20"
                    />
                  </Field>

                  <Field label="Slug">
                    <Input
                      value={slug}
                      onChange={(event) =>
                        setSlug(
                          event.target
                            .value
                        )
                      }
                      placeholder="todoist"
                      className="bg-black/20 font-mono text-xs"
                    />
                  </Field>

                  <Field label="Category">
                    <select
                      value={category}
                      onChange={(event) =>
                        setCategory(
                          event.target
                            .value
                        )
                      }
                      className="h-10 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-sm text-slate-300 outline-none focus:border-emerald-500/40"
                    >
                      {categoryOptions.map(
                        (item) => (
                          <option
                            key={item}
                            value={item}
                            className="bg-slate-950"
                          >
                            {item
                              .charAt(
                                0
                              )
                              .toUpperCase() +
                              item.slice(
                                1
                              )}
                          </option>
                        )
                      )}
                    </select>
                  </Field>

                  <Field label="Icon">
                    <select
                      value={icon}
                      onChange={(event) =>
                        setIcon(
                          event.target
                            .value
                        )
                      }
                      className="h-10 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-sm text-slate-300 outline-none focus:border-emerald-500/40"
                    >
                      {iconOptions.map(
                        (item) => (
                          <option
                            key={
                              item.value
                            }
                            value={
                              item.value
                            }
                            className="bg-slate-950"
                          >
                            {item.label}
                          </option>
                        )
                      )}
                    </select>
                  </Field>
                </div>

                <div className="mt-4">
                  <Field label="Description">
                    <textarea
                      value={
                        description
                      }
                      onChange={(
                        event
                      ) =>
                        setDescription(
                          event.target
                            .value
                        )
                      }
                      placeholder="Manage tasks from Todoist using Gemini."
                      className="min-h-[90px] w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-slate-300 outline-none placeholder:text-slate-700 focus:border-emerald-500/40"
                    />
                  </Field>
                </div>
              </BuilderSection>

              <BuilderSection
                number="02"
                title="Connection"
                description="Tell the gateway where the API lives and how to authenticate."
              >
                <Field
                  label="API Base URL"
                  required
                >
                  <Input
                    value={baseUrl}
                    onChange={(event) =>
                      setBaseUrl(
                        event.target
                          .value
                      )
                    }
                    placeholder="https://api.example.com/v1"
                    className="bg-black/20 font-mono text-xs"
                  />
                </Field>

                <div className="mt-4">
                  <Field label="Authentication">
                    <select
                      value={authType}
                      onChange={(event) =>
                        setAuthType(
                          event.target
                            .value
                        )
                      }
                      className="h-11 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-sm text-slate-300 outline-none focus:border-emerald-500/40"
                    >
                      {authOptions.map(
                        (item) => (
                          <option
                            key={
                              item.value
                            }
                            value={
                              item.value
                            }
                            className="bg-slate-950"
                          >
                            {item.label}
                          </option>
                        )
                      )}
                    </select>
                  </Field>
                </div>

                {authType !== 'none' && (
                  <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
                      <Shield className="h-4 w-4 text-emerald-400" />

                      Authentication
                    </div>

                    {authType ===
                      'oauth2' ? (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-300">
                        OAuth 2.0 akan kita
                        integrasikan dengan
                        credential manager pada
                        tahap berikutnya. Untuk
                        sekarang konfigurasi dasar
                        disimpan sebagai definisi
                        integration.
                      </div>
                    ) : (
                      <>
                        <Field
                          label={
                            authType ===
                            'api_key'
                              ? 'API Key'
                              : 'Token / Credential'
                          }
                        >
                          <Input
                            type="password"
                            value={
                              credential
                            }
                            onChange={(
                              event
                            ) =>
                              setCredential(
                                event.target
                                  .value
                              )
                            }
                            placeholder={
                              editing
                                ? 'Leave blank to keep existing credential'
                                : 'Enter credential'
                            }
                            className="bg-black"
                          />
                        </Field>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Field label="Header">
                            <Input
                              value={
                                authHeader
                              }
                              onChange={(
                                event
                              ) =>
                                setAuthHeader(
                                  event
                                    .target
                                    .value
                                )
                              }
                              placeholder="Authorization"
                              className="bg-black"
                            />
                          </Field>

                          {authType !==
                            'api_key' && (
                            <Field label="Prefix">
                              <Input
                                value={
                                  authPrefix
                                }
                                onChange={(
                                  event
                                ) =>
                                  setAuthPrefix(
                                    event
                                      .target
                                      .value
                                  )
                                }
                                placeholder="Bearer"
                                className="bg-black"
                              />
                            </Field>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-cyan-500/10 bg-cyan-500/5 p-4">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />

                  <p className="text-xs leading-5 text-slate-500">
                    Credential management akan dipindahkan
                    ke layer endpoint dan disimpan
                    terenkripsi. Jangan membagikan token
                    ke orang lain.
                  </p>
                </div>
              </BuilderSection>

              <BuilderSection
                number="03"
                title="Tools"
                description="Choose what Gemini is allowed to do with this API."
              >
                <div className="space-y-3">
                  {tools.map(
                    (tool, index) => (
                      <SimpleToolCard
                        key={
                          tool.id ||
                          index
                        }
                        tool={tool}
                        index={index}
                        onEdit={() => {
                          const element =
                            document.getElementById(
                              `tool-${index}`
                            );

                          element?.scrollIntoView(
                            {
                              behavior:
                                'smooth',
                              block:
                                'center',
                            }
                          );
                        }}
                        onDelete={() =>
                          removeTool(
                            index
                          )
                        }
                        canDelete={
                          tools.length >
                          1
                        }
                      />
                    )
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={addTool}
                  className="mt-4 w-full rounded-xl border-dashed border-white/[0.12] bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Tool
                </Button>

                <div className="mt-5 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        Advanced tool settings
                      </p>

                      <p className="mt-1 text-xs text-slate-600">
                        Only open this if you need custom JSON mappings.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setAdvancedOpen(
                          !advancedOpen
                        )
                      }
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-white"
                    >
                      {advancedOpen
                        ? 'Hide'
                        : 'Show'}

                      {advancedOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {advancedOpen && (
                    <div className="mt-5 space-y-4">
                      {tools.map(
                        (
                          tool,
                          index
                        ) => (
                          <AdvancedToolEditor
                            key={
                              tool.id ||
                              index
                            }
                            index={
                              index
                            }
                            tool={
                              tool
                            }
                            onChange={
                              updateTool
                            }
                          />
                        )
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-emerald-500/10 bg-emerald-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <Zap className="mt-0.5 h-4 w-4 text-emerald-400" />

                    <div>
                      <p className="text-sm font-medium text-emerald-300">
                        How this works
                      </p>

                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Each tool becomes a capability
                        that your MCP Gateway can expose
                        to Gemini Spark. Later, the gateway
                        will automatically translate Gemini's
                        tool call into an API request.
                      </p>
                    </div>
                  </div>
                </div>
              </BuilderSection>
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/30 px-6 py-4">
            <div className="text-xs text-slate-600">
              {tools.length}{' '}
              tool
              {tools.length === 1
                ? ''
                : 's'} configured
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-500 px-5 text-slate-950 hover:bg-emerald-400"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />

                    {editing
                      ? 'Save Changes'
                      : 'Create Integration'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

function BuilderSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 font-mono text-xs font-semibold text-emerald-400">
          {number}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white">
            {title}
          </h3>

          <p className="mt-1 text-xs leading-5 text-slate-600">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-5">
        {children}
      </div>
    </section>
  );
}

function SimpleToolCard({
  tool,
  index,
  onEdit,
  onDelete,
  canDelete,
}: {
  tool: ToolForm;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <div
      id={`tool-${index}`}
      className="rounded-2xl border border-white/[0.07] bg-black/20 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 font-mono text-xs font-semibold text-emerald-400">
            {index + 1}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-mono text-sm font-medium text-white">
                {tool.name ||
                  'Unnamed tool'}
              </p>

              <Badge
                variant="outline"
                className={
                  tool.method ===
                  'GET'
                    ? 'border-blue-500/20 text-blue-400'
                    : tool.method ===
                      'DELETE'
                      ? 'border-red-500/20 text-red-400'
                      : 'border-emerald-500/20 text-emerald-400'
                }
              >
                {tool.method}
              </Badge>

              <Badge
                variant="outline"
                className="border-white/[0.07] text-slate-500"
              >
                {tool.permission}
              </Badge>
            </div>

            <p className="mt-1 truncate font-mono text-xs text-slate-600">
              {tool.path ||
                '/api/path'}
            </p>

            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
              {tool.description ||
                'No description yet.'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="rounded-lg text-slate-500 hover:bg-white/[0.05] hover:text-white"
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!canDelete}
            onClick={onDelete}
            className="rounded-lg text-slate-600 hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AdvancedToolEditor({
  index,
  tool,
  onChange,
}: {
  index: number;
  tool: ToolForm;
  onChange: (
    index: number,
    field: keyof ToolForm,
    value: string | boolean
  ) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/30 p-4">
      <p className="mb-4 font-mono text-xs text-emerald-400">
        Tool #{index + 1}{' '}
        Advanced Settings
      </p>

      <div className="space-y-4">
        <AdvancedField
          label="Input Schema JSON"
          value={
            tool.inputSchema
          }
          onChange={(value) =>
            onChange(
              index,
              'inputSchema',
              value
            )
          }
        />

        <AdvancedField
          label="Headers Template JSON"
          value={
            tool.headersTemplate
          }
          onChange={(value) =>
            onChange(
              index,
              'headersTemplate',
              value
            )
          }
        />

        <AdvancedField
          label="Query Template JSON"
          value={
            tool.queryTemplate
          }
          onChange={(value) =>
            onChange(
              index,
              'queryTemplate',
              value
            )
          }
        />

        <AdvancedField
          label="Body Template JSON"
          value={
            tool.bodyTemplate
          }
          onChange={(value) =>
            onChange(
              index,
              'bodyTemplate',
              value
            )
          }
        />

        <AdvancedField
          label="Response Mapping JSON"
          value={
            tool.responseMapping
          }
          onChange={(value) =>
            onChange(
              index,
              'responseMapping',
              value
            )
          }
        />
      </div>
    </div>
  );
}

function AdvancedField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-slate-500">
        {label}
      </label>

      <textarea
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="min-h-[110px] w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 font-mono text-xs text-slate-300 outline-none placeholder:text-slate-700 focus:border-emerald-500/40"
      />
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-slate-500">
        {label}

        {required && (
          <span className="ml-1 text-emerald-400">
            *
          </span>
        )}
      </label>

      {children}
    </div>
  );
}

function IntegrationSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.06] p-5">
      <div className="flex gap-4">
        <div className="h-11 w-11 animate-pulse rounded-xl bg-white/[0.05]" />

        <div className="flex-1 space-y-3">
          <div className="h-4 w-32 animate-pulse rounded bg-white/[0.05]" />

          <div className="h-3 w-24 animate-pulse rounded bg-white/[0.05]" />

          <div className="h-8 w-full animate-pulse rounded bg-white/[0.05]" />
        </div>
      </div>
    </div>
  );
}

function EmptyIntegrationState({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <div className="flex min-h-[460px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/10 bg-emerald-500/5">
        <Server className="h-7 w-7 text-emerald-400" />
      </div>

      <h3 className="text-lg font-semibold text-white">
        No integrations yet
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
        Create your first API integration and
        connect it to an MCP endpoint.
      </p>

      <Button
        onClick={onCreate}
        className="mt-6 rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400"
      >
        <Plus className="mr-2 h-4 w-4" />
        Create Integration
      </Button>
    </div>
  );
}