'use client';

import React, { useState } from 'react';
import type { AdminSosAlert } from '@/hooks/useAdminFleet';
import { Button } from '@bts/ui';

interface EmergencySosBannerProps {
  alerts: AdminSosAlert[];
  onAcknowledge: (alertId: string) => Promise<{ success: boolean; error?: string }>;
}

export function EmergencySosBanner({ alerts, onAcknowledge }: EmergencySosBannerProps) {
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter for alerts requiring attention (unacknowledged first, then unresolved)
  const pendingAlerts = alerts.filter((a) => !a.isAcknowledged || !a.isResolved);

  if (pendingAlerts.length === 0) {
    return null;
  }

  const handleAcknowledge = async (id: string) => {
    try {
      setAcknowledgingId(id);
      setErrorMsg(null);
      const res = await onAcknowledge(id);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to acknowledge alert.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error acknowledging alert.');
    } finally {
      setAcknowledgingId(null);
    }
  };

  return (
    <div className="flex flex-col space-y-3">
      {pendingAlerts.map((alert) => {
        const isPendingAck = !alert.isAcknowledged;
        const formattedTime = new Date(alert.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const gps = alert.lastKnownGps;

        return (
          <div
            key={alert.id}
            className={`relative overflow-hidden rounded-2xl border-2 p-5 shadow-lg transition-all ${
              isPendingAck
                ? 'border-red-500 bg-red-600 text-white animate-pulse'
                : 'border-amber-400 bg-amber-500 text-amber-950'
            }`}
            role="alert"
            aria-live="assertive"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Alert Left Column: Details */}
              <div className="flex items-start space-x-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-2xl backdrop-blur-sm">
                  🚨
                </span>
                <div className="flex flex-col space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black tracking-widest uppercase bg-black/30 px-2 py-0.5 rounded-md">
                      {isPendingAck ? 'CRITICAL EMERGENCY SOS' : 'SOS IN PROGRESS / PENDING RESOLUTION'}
                    </span>
                    <span className="text-xs opacity-90">
                      Dispatched at {formattedTime}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold">
                    <span>
                      🚌 Plate: <strong className="underline">{alert.bus?.plateNumber || 'Unassigned Vehicle'}</strong>
                    </span>
                    <span>
                      👨‍✈️ Driver: <strong>{alert.driver?.name || alert.driver?.licenseNumber || 'Driver'}</strong> ({alert.driver?.phone || 'No phone'})
                    </span>
                    <span>
                      🗺️ Route: <strong>{alert.route?.name || 'Assigned Route'}</strong>
                    </span>
                  </div>

                  {/* GPS Coordinates */}
                  <div className="text-xs font-mono opacity-90">
                    📍 Last Known Coordinates:{' '}
                    {gps?.latitude && gps?.longitude ? (
                      <span className="font-bold underline">
                        {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
                        {gps.speed !== undefined && gps.speed !== null && (
                          <span className="ml-2 font-normal font-sans">
                            ({Math.round(gps.speed)} km/h)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="italic">GPS telemetry unavailable at transmission</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Alert Right Column: Action Buttons */}
              <div className="flex shrink-0 items-center gap-2 sm:self-center">
                {isPendingAck ? (
                  <Button
                    variant="primary"
                    size="md"
                    className="bg-white text-red-700 hover:bg-gray-100 font-extrabold shadow-md border-0 uppercase tracking-wider text-xs"
                    onClick={() => handleAcknowledge(alert.id)}
                    disabled={acknowledgingId === alert.id}
                  >
                    {acknowledgingId === alert.id ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-700 border-t-transparent" />
                        Stamping...
                      </span>
                    ) : (
                      '✓ Acknowledge Alert'
                    )}
                  </Button>
                ) : (
                  <div className="rounded-xl bg-white/20 px-3 py-1.5 text-xs font-bold text-amber-950 backdrop-blur-sm">
                    Acknowledged • Dispatch Active
                  </div>
                )}
              </div>
            </div>

            {errorMsg && acknowledgingId === alert.id && (
              <div className="mt-2 text-xs font-bold text-white bg-black/40 px-3 py-1 rounded-lg">
                ⚠️ {errorMsg}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
