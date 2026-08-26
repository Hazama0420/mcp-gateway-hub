// app/admin/logs/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Activity, Clock, CheckCircle2, AlertCircle, Server } from 'lucide-react';

export default function ExecutionLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      const res = await fetch('/api/endpoints/logs');
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
    } catch (error) {
      console.error('Gagal memuat log:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-white">
              <Activity className="w-7 h-7 text-emerald-400" />
              Riwayat Eksekusi
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Pantau seluruh aktivitas pemanggilan tool dari klien MCP secara real-time.
            </p>
          </div>
          <button
            onClick={fetchLogs}
            className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg text-sm font-medium transition"
          >
            Refresh Data
          </button>
        </div>

        {/* Tabel Data */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-950/50 border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Waktu</th>
                  <th className="px-6 py-4 font-medium">Endpoint Asal</th>
                  <th className="px-6 py-4 font-medium">Tool yang Dipanggil</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      Memuat data log...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      Belum ada riwayat eksekusi.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/20 transition">
                      <td className="px-6 py-4 text-slate-400">
                        {new Date(log.created_at).toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-slate-500" />
                          <span className="font-medium text-slate-200">
                            {log.endpoint?.name || 'Endpoint Terhapus'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-indigo-400">
                        {log.tool_name}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          log.status.startsWith('2') || log.status === 'OK'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}>
                          {log.status.startsWith('2') || log.status === 'OK' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5" />
                          )}
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          {log.execution_time_ms} ms
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}