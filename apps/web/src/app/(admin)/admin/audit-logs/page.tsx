'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getAdminAuditLogsAction } from '@/services/admin.service';
import { Skeleton, EmptyState, Button } from '@bts/ui';

interface AdminAuditItem {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  timestamp: string;
  metadata: any;
  admin: {
    id: string;
    email: string;
    role: string;
  } | null;
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AdminAuditItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('ALL');

  // JSON Inspector Modal state
  const [selectedAuditForInspect, setSelectedAuditForInspect] = useState<AdminAuditItem | null>(null);

  // Global notice
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getAdminAuditLogsAction({
        targetType: targetTypeFilter !== 'ALL' ? targetTypeFilter : undefined,
        limit: 100,
      });
      if (res?.data) {
        setLogs(res.data);
      }
    } catch (err: any) {
      setNoticeMessage(err.message || 'Failed to fetch immutable audit trail');
    } finally {
      setIsLoading(false);
    }
  }, [targetTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionColor = (action: string) => {
    if (action.includes('CREATED') || action.includes('RESOLVED')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (action.includes('CANCELLED') || action.includes('DEACTIVATED')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (action.includes('ACKNOWLEDGED') || action.includes('UPDATED')) {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  return (
    <div className="flex flex-col space-y-6 animate-slide-up">
      {/* 1. Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Immutable Governance Audit Trail
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-800 border border-slate-300">
              🔒 Append-Only Log
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Cryptographically sealed and audited administrative dispatch, fleet mutations, and emergency safety actions
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => fetchLogs()}
          disabled={isLoading}
          className="rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 self-start sm:self-auto"
        >
          {isLoading ? 'Updating...' : '🔄 Refresh Trail'}
        </Button>
      </div>

      {/* 2. Notice Banner */}
      {noticeMessage && (
        <div
          className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs font-bold text-rose-800 shadow-sm"
          role="alert"
        >
          ⚠️ {noticeMessage}
        </div>
      )}

      {/* 3. Filter Pills */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-gray-100/70 p-1">
          {['ALL', 'BUS', 'DRIVER', 'TRIP', 'SOS', 'MAINTENANCE'].map((type) => (
            <button
              key={type}
              onClick={() => setTargetTypeFilter(type)}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                targetTypeFilter === type
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {type === 'ALL' ? 'All Entities' : type}
            </button>
          ))}
        </div>

        <div className="text-xs text-gray-500 font-medium">
          Logged Events: <span className="font-bold text-gray-900">{logs.length}</span>
        </div>
      </div>

      {/* 4. Immutable Audit Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <EmptyState
            title="No audit records found"
            description="No administrative activities have been logged matching the specified filter criteria."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Timestamp</th>
                  <th scope="col" className="px-5 py-3.5">Administrator</th>
                  <th scope="col" className="px-5 py-3.5">Action Executed</th>
                  <th scope="col" className="px-5 py-3.5">Target Type</th>
                  <th scope="col" className="px-5 py-3.5">Target ID</th>
                  <th scope="col" className="px-5 py-3.5">Sanitized Metadata</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const metaStr = log.metadata ? JSON.stringify(log.metadata) : 'None';

                  return (
                    <tr key={log.id} className="transition-colors hover:bg-gray-50/70">
                      {/* Timestamp */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-mono text-xs font-bold text-gray-900">
                          {new Date(log.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono">
                          {new Date(log.timestamp).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Admin Actor */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-gray-900 text-xs">
                          {log.admin?.email || 'System Dispatcher'}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono">
                          ID: {log.adminId ? log.adminId.slice(-8) : 'N/A'}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-xs font-mono font-bold ${getActionColor(
                            log.action,
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* Target Type */}
                      <td className="px-5 py-4">
                        <span className="font-extrabold text-xs text-gray-800">
                          {log.targetType}
                        </span>
                      </td>

                      {/* Target ID */}
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-gray-500">
                          {log.targetId.slice(-10)}
                        </span>
                      </td>

                      {/* Metadata Summary */}
                      <td className="px-5 py-4 max-w-xs">
                        <div
                          className="truncate font-mono text-[11px] text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-200"
                          title={metaStr}
                        >
                          {metaStr}
                        </div>
                      </td>

                      {/* Inspect Action */}
                      <td className="px-5 py-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedAuditForInspect(log)}
                          className="rounded-lg text-xs font-bold text-gray-700 border-gray-300 hover:bg-gray-100"
                        >
                          🔍 View JSON
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Formatted JSON Inspector Modal */}
      {selectedAuditForInspect && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-xl rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  Audit Record Inspector
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  Action: <span className="font-bold text-gray-800">{selectedAuditForInspect.action}</span> • Target: <span className="font-bold text-gray-800">{selectedAuditForInspect.targetType} ({selectedAuditForInspect.targetId})</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedAuditForInspect(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>
                  Admin: <strong className="text-gray-900">{selectedAuditForInspect.admin?.email || selectedAuditForInspect.adminId}</strong>
                </span>
                <span>
                  Recorded: <strong className="text-gray-900">{new Date(selectedAuditForInspect.timestamp).toLocaleString()}</strong>
                </span>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4 text-xs font-mono text-emerald-400 overflow-x-auto max-h-80">
                <pre>
                  {JSON.stringify(
                    {
                      auditId: selectedAuditForInspect.id,
                      action: selectedAuditForInspect.action,
                      targetType: selectedAuditForInspect.targetType,
                      targetId: selectedAuditForInspect.targetId,
                      adminId: selectedAuditForInspect.adminId,
                      timestamp: selectedAuditForInspect.timestamp,
                      metadata: selectedAuditForInspect.metadata || {},
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800 font-medium">
                🛡️ All sensitive credentials, tokens, and authorization secrets have been permanently redacted at ingestion prior to persistence. This record is immutable.
              </div>
            </div>

            <div className="mt-6 flex justify-end pt-3 border-t border-gray-100">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setSelectedAuditForInspect(null)}
                className="rounded-xl border border-gray-300 text-xs font-bold text-gray-700"
              >
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
