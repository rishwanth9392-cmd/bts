'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getAdminSosAlertsAction,
  acknowledgeAdminSosAction,
  resolveAdminSosAction,
} from '@/services/admin.service';
import { StatusBadge, Skeleton, EmptyState, Button } from '@bts/ui';

interface SosAlertItem {
  id: string;
  tripId: string | null;
  driverId: string | null;
  timestamp: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  isAcknowledged: boolean;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  isResolved: boolean;
  lastKnownGps: {
    lat?: number;
    latitude?: number;
    lng?: number;
    longitude?: number;
    speed?: number;
  } | null;
  route: { id: string; name: string } | null;
  bus: { id: string; plateNumber: string; model: string | null } | null;
  driver: {
    id: string;
    name: string | null;
    licenseNumber: string;
    phone: string | null;
    email: string;
  } | null;
  metadata?: any;
}

export default function AdminSosPage() {
  const [alerts, setAlerts] = useState<SosAlertItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unacknowledged' | 'unresolved'>('all');

  // Resolution modal state
  const [selectedAlertForResolve, setSelectedAlertForResolve] = useState<SosAlertItem | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [isSubmittingResolve, setIsSubmittingResolve] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const resolveModalRef = useRef<HTMLDivElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus trap, auto-focus resolution notes, and Escape key listener for SOS modal
  useEffect(() => {
    if (!selectedAlertForResolve) return;

    // Focus resolution notes on modal open
    const timer = setTimeout(() => {
      notesTextareaRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isSubmittingResolve) {
          setSelectedAlertForResolve(null);
        }
      } else if (e.key === 'Tab') {
        if (!resolveModalRef.current) return;
        const focusable = resolveModalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedAlertForResolve, isSubmittingResolve]);

  // Global notice / toast
  const [noticeMessage, setNoticeMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getAdminSosAlertsAction({
        status: statusFilter,
        limit: 100,
      });
      if (res?.data) {
        setAlerts(res.data);
      }
    } catch (err: any) {
      setNoticeMessage({
        type: 'error',
        text: err.message || 'Failed to fetch emergency SOS records',
      });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleAcknowledge = async (alertId: string) => {
    const res = await acknowledgeAdminSosAction(alertId);
    if (!res.success) {
      setNoticeMessage({
        type: 'error',
        text: res.error || 'Failed to acknowledge emergency alert.',
      });
      return;
    }
    setNoticeMessage({
      type: 'success',
      text: 'Emergency alert has been officially acknowledged.',
    });
    fetchAlerts();
  };

  const handleOpenResolveModal = (alert: SosAlertItem) => {
    setSelectedAlertForResolve(alert);
    setResolutionNotes('');
    setResolveError(null);
  };

  const handleConfirmResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlertForResolve) return;

    if (!resolutionNotes.trim()) {
      setResolveError('Resolution notes are required to formally close an emergency alert.');
      return;
    }

    setIsSubmittingResolve(true);
    setResolveError(null);

    try {
      const res = await resolveAdminSosAction(
        selectedAlertForResolve.id,
        resolutionNotes.trim(),
      );

      if (!res.success) {
        setResolveError(res.error || 'Failed to resolve emergency alert.');
        setIsSubmittingResolve(false);
        return;
      }

      setNoticeMessage({
        type: 'success',
        text: 'Emergency alert successfully resolved and archived into audit history.',
      });
      setSelectedAlertForResolve(null);
      fetchAlerts();
    } catch (err: any) {
      setResolveError(err.message || 'Network error resolving alert');
    } finally {
      setIsSubmittingResolve(false);
    }
  };

  return (
    <div className="flex flex-col space-y-6 animate-slide-up">
      {/* 1. Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Emergency SOS Incident Operations
            </h1>
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-black text-rose-800 border border-rose-300">
              High Priority Safety
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Real-time distress beacon tracking, dispatcher acknowledgment, and audited incident resolution
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => fetchAlerts()}
          disabled={isLoading}
          className="rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 self-start sm:self-auto"
        >
          {isLoading ? 'Updating...' : '🔄 Refresh Alerts'}
        </Button>
      </div>

      {/* 2. Notice Banner */}
      {noticeMessage && (
        <div
          className={`flex items-center justify-between rounded-2xl border p-4 text-xs font-bold shadow-sm animate-fadeIn ${
            noticeMessage.type === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-800'
              : 'border-emerald-300 bg-emerald-50 text-emerald-800'
          }`}
          role="alert"
        >
          <span>
            {noticeMessage.type === 'error' ? '⚠️ ' : '✅ '}
            {noticeMessage.text}
          </span>
          <button
            onClick={() => setNoticeMessage(null)}
            className="text-gray-400 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Filter Pills */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-gray-100/70 p-1">
          {[
            { id: 'all', label: 'All Incidents' },
            { id: 'unacknowledged', label: 'Pending Acknowledgment' },
            { id: 'unresolved', label: 'Unresolved Active' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                statusFilter === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-gray-500 font-medium">
          Total Recorded: <span className="font-bold text-gray-900">{alerts.length}</span>
        </div>
      </div>

      {/* 4. Incident Roster Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <EmptyState
            title="No emergency incidents recorded"
            description="All fleet buses and drivers are operating without active emergency distress signals."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Status</th>
                  <th scope="col" className="px-5 py-3.5">Triggered Time</th>
                  <th scope="col" className="px-5 py-3.5">Route / Vehicle</th>
                  <th scope="col" className="px-5 py-3.5">Driver Personnel</th>
                  <th scope="col" className="px-5 py-3.5">Last Known GPS</th>
                  <th scope="col" className="px-5 py-3.5">Resolution Notes</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {alerts.map((alert) => {
                  let statusText = 'PENDING_ACK';
                  let statusColor: 'danger' | 'warning' | 'success' = 'danger';

                  if (alert.isResolved) {
                    statusText = 'RESOLVED';
                    statusColor = 'success';
                  } else if (alert.isAcknowledged) {
                    statusText = 'ACKNOWLEDGED';
                    statusColor = 'warning';
                  }

                  const lat = alert.lastKnownGps?.latitude ?? alert.lastKnownGps?.lat;
                  const lng = alert.lastKnownGps?.longitude ?? alert.lastKnownGps?.lng;
                  const speed = alert.lastKnownGps?.speed;

                  return (
                    <tr
                      key={alert.id}
                      className={`transition-colors ${
                        statusText === 'PENDING_ACK'
                          ? 'bg-rose-50/50 hover:bg-rose-50/80'
                          : 'hover:bg-gray-50/70'
                      }`}
                    >
                      {/* Status */}
                      <td className="px-5 py-4">
                        <StatusBadge status={statusText} color={statusColor} />
                      </td>

                      {/* Timestamp */}
                      <td className="px-5 py-4">
                        <div className="font-bold text-gray-900 text-xs">
                          {new Date(alert.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {new Date(alert.timestamp).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Route / Vehicle */}
                      <td className="px-5 py-4">
                        <div className="font-black text-gray-900">
                          {alert.bus?.plateNumber || 'Vehicle N/A'}
                        </div>
                        <div className="text-xs text-emerald-700 font-bold">
                          🚍 {alert.route?.name || 'Assigned Route'}
                        </div>
                      </td>

                      {/* Driver */}
                      <td className="px-5 py-4">
                        <div className="font-bold text-gray-900 text-xs">
                          {alert.driver?.name || 'Driver'}
                        </div>
                        <div className="text-[11px] text-gray-500 font-mono">
                          {alert.driver?.phone || alert.driver?.licenseNumber || 'License N/A'}
                        </div>
                      </td>

                      {/* GPS & Speed */}
                      <td className="px-5 py-4">
                        {lat !== undefined && lng !== undefined ? (
                          <div>
                            <div className="font-mono text-xs font-bold text-gray-800">
                              {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Speed: {speed !== undefined ? `${Number(speed).toFixed(1)} km/h` : '0 km/h'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No GPS telemetry</span>
                        )}
                      </td>

                      {/* Resolution details */}
                      <td className="px-5 py-4 max-w-xs">
                        {alert.isResolved ? (
                          <div>
                            <div className="text-xs font-medium text-gray-800 truncate" title={alert.resolutionNotes || ''}>
                              “{alert.resolutionNotes}”
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              Closed: {alert.resolvedAt ? new Date(alert.resolvedAt).toLocaleTimeString() : 'Done'}
                            </div>
                          </div>
                        ) : alert.isAcknowledged ? (
                          <div>
                            <span className="text-xs text-amber-700 font-semibold">
                              Acknowledged by dispatcher
                            </span>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {alert.acknowledgedAt ? new Date(alert.acknowledgedAt).toLocaleTimeString() : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-rose-600 font-extrabold animate-pulse">
                            Action Required
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right space-x-2">
                        {!alert.isAcknowledged && !alert.isResolved && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleAcknowledge(alert.id)}
                            className="rounded-lg bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-sm"
                          >
                            Acknowledge
                          </Button>
                        )}

                        {!alert.isResolved && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenResolveModal(alert)}
                            className="rounded-lg border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs font-bold"
                          >
                            Resolve
                          </Button>
                        )}

                        {alert.isResolved && (
                          <span className="inline-block text-xs font-bold text-emerald-600">
                            ✓ Archived
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Resolution Modal */}
      {selectedAlertForResolve && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div ref={resolveModalRef} className="relative w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  Resolve Emergency SOS Incident
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Vehicle: <span className="font-bold text-gray-800">{selectedAlertForResolve.bus?.plateNumber || 'N/A'}</span> • Driver: <span className="font-bold text-gray-800">{selectedAlertForResolve.driver?.name || 'N/A'}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedAlertForResolve(null)}
                disabled={isSubmittingResolve}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {resolveError && (
              <div id="resolve-sos-error" role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-800">
                ⚠️ {resolveError}
              </div>
            )}

            <form onSubmit={handleConfirmResolve} className="mt-4 space-y-4">
              <div className="space-y-1">
                <label htmlFor="resolution-notes" className="text-xs font-bold text-gray-700">
                  Incident Resolution Notes <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="resolution-notes"
                  ref={notesTextareaRef}
                  rows={4}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Detail operational resolution (e.g. Assistance vehicle arrived; replacement bus dispatched; driver and passengers verified secure)."
                  className="w-full rounded-xl border border-gray-300 p-3 text-xs text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                  disabled={isSubmittingResolve}
                  aria-describedby={resolveError ? 'resolve-sos-error' : undefined}
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-600">
                ℹ️ Submitting will timestamp resolution, link your administrator account, and permanently archive the distress beacon into the immutable audit trail.
              </div>

              <div className="mt-6 flex items-center justify-end space-x-3 pt-3 border-t border-gray-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setSelectedAlertForResolve(null)}
                  disabled={isSubmittingResolve}
                  className="rounded-xl border border-gray-300 text-xs font-bold text-gray-700"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmittingResolve}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-white shadow-md text-xs"
                >
                  {isSubmittingResolve ? 'Resolving...' : 'Confirm Incident Resolution'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
