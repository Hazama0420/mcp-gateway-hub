// app/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { Plus, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateEndpointModal } from '@/components/CreateEndpointModal';
import { formatDistanceToNow } from 'date-fns';

interface Endpoint {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  services: { service_type: string }[];
}

interface Log {
  id: string;
  tool_name: string;
  status: 'success' | 'error';
  execution_time_ms: number;
  created_at: string;
}

export default function DashboardPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [endpointsRes, logsRes] = await Promise.all([
        fetch('/api/endpoints'),
        fetch('/api/endpoints/logs?limit=20'),
      ]);
      if (endpointsRes.ok) {
        const data = await endpointsRes.json();
        setEndpoints(data);
      }
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEndpointCreated = () => {
    setIsModalOpen(false);
    fetchData();
  };

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">MCP Gateway Dashboard</h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Endpoint
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daftar Endpoint */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Your Endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : endpoints.length === 0 ? (
              <p className="text-muted-foreground text-sm">No endpoints created yet.</p>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {endpoints.map((ep) => {
                    const sseUrl = `${window.location.origin}/api/mcp/${ep.id}/sse`;
                    return (
                      <div
                        key={ep.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition"
                      >
                        <div>
                          <p className="font-medium">{ep.name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>ID: {ep.id.slice(0, 8)}</span>
                            <span>•</span>
                            <span>
                              Created {formatDistanceToNow(new Date(ep.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {ep.services.map((s) => (
                              <Badge key={s.service_type} variant="outline" className="text-xs">
                                {s.service_type}
                              </Badge>
                            ))}
                          </div>
                          {/* 🔥 TOMBOL COPY URL */}
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                              {sseUrl}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleCopy(ep.id, sseUrl)}
                            >
                              {copiedId === ep.id ? (
                                <>
                                  <Check className="h-3 w-3 mr-1" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 mr-1" /> Copy
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                        <Badge variant={ep.is_active ? 'default' : 'secondary'}>
                          {ep.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Log Riwayat */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Executions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No executions yet.</p>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="text-sm border-b pb-2">
                      <div className="flex justify-between">
                        <span className="font-mono">{log.tool_name}</span>
                        <Badge variant={log.status === 'success' ? 'outline' : 'destructive'}>
                          {log.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-muted-foreground text-xs mt-1">
                        <span>{log.execution_time_ms}ms</span>
                        <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateEndpointModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSuccess={handleEndpointCreated}
      />
    </div>
  );
}