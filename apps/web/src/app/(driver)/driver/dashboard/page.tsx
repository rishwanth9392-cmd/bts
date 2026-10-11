'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDriverOperations } from '@/hooks/useDriverOperations';
import { useDriverTelemetry } from '@/hooks/useDriverTelemetry';
import { useTripTelemetry } from '@/hooks/useTripTelemetry';
import { StatusBadge, Skeleton } from '@bts/ui';

export default function DriverDashboard() {
  const {
    tripData,
    trip,
    bus,
    route,
    status,
    isLoading,
    actionLoading,
    statusMessage,
    setStatusMessage,
    startTrip,
    endTrip,
    triggerSos,
    isOffline,
  } = useDriverOperations();

  // Active Guard: Stream GPS upload ONLY when trip.status === 'ACTIVE'
  const driverGps = useDriverTelemetry(trip?.id, status);

  // Live telemetry listener for subscribers (progress, occupancy, etc.)
  const telemetry = useTripTelemetry(status === 'ACTIVE' ? trip?.id : null);

  // End Trip Confirmation Modal State
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const endModalRef = useRef<HTMLDivElement>(null);

  // Focus trapping and Escape key listener for End Trip Modal
  useEffect(() => {
    if (!showEndModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEndModal(false);
      } else if (e.key === 'Tab') {
        if (!endModalRef.current) return;
        const focusable = endModalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

    const timer = setTimeout(() => {
      const firstBtn = endModalRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
      firstBtn?.focus();
    }, 50);

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showEndModal]);

  // SOS Emergency States
  const [sosActive, setSosActive] = useState<boolean>(false);
  const [showSosModal, setShowSosModal] = useState<boolean>(false);
  const [sosHoldProgress, setSosHoldProgress] = useState<number>(0);
  const [isHoldingSos, setIsHoldingSos] = useState<boolean>(false);

  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartTimeRef = useRef<number>(0);
  const HOLD_DURATION_MS = 2500; // 2.5 seconds hold to confirm

  // Dynamic "Last GPS Fix: X seconds ago" indicator
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);

  useEffect(() => {
    const timestamp = driverGps.lastLocation?.recordedAt || telemetry.recordedAt;
    if (!timestamp) {
      setSecondsAgo(null);
      return;
    }

    const updateAgo = () => {
      const recorded = new Date(timestamp).getTime();
      const diff = Math.max(0, Math.floor((Date.now() - recorded) / 1000));
      setSecondsAgo(diff);
    };

    updateAgo();
    const interval = setInterval(updateAgo, 1000);
    return () => clearInterval(interval);
  }, [driverGps.lastLocation?.recordedAt, telemetry.recordedAt]);

  const handleStartTrip = async () => {
    await startTrip();
  };

  const handleConfirmEndTrip = async () => {
    setShowEndModal(false);
    await endTrip();
  };

  /**
   * Triggers emergency SOS workflow
   */
  const handleConfirmSos = useCallback(async () => {
    setShowSosModal(false);
    setSosActive(true);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([300, 150, 300, 150, 300]);
      } catch (_err) {
        // Haptic feedback not supported on this device
      }
    }
    await triggerSos();
  }, [triggerSos]);

  // Hold to Confirm Interaction Handlers
  const handleSosHoldStart = () => {
    if (actionLoading === 'sos' || sosActive) return;
    setIsHoldingSos(true);
    holdStartTimeRef.current = Date.now();

    if (holdTimerRef.current) clearInterval(holdTimerRef.current);

    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartTimeRef.current;
      const progress = Math.min(100, Math.round((elapsed / HOLD_DURATION_MS) * 100));
      setSosHoldProgress(progress);

      if (progress >= 100) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
        setIsHoldingSos(false);
        setSosHoldProgress(0);
        handleConfirmSos();
      }
    }, 50);
  };

  const handleSosHoldEnd = () => {
    if (!isHoldingSos) return;

    const elapsed = Date.now() - holdStartTimeRef.current;
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHoldingSos(false);
    setSosHoldProgress(0);

    // If released before 2.5s but tapped deliberately (>100ms), show explicit confirmation modal
    if (elapsed < HOLD_DURATION_MS && elapsed > 80 && !sosActive) {
      setShowSosModal(true);
    }
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  // ── Loading Skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col space-y-6 p-4 max-w-2xl mx-auto animate-slide-up">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <Skeleton className="mb-4 h-6 w-1/3" />
          <Skeleton className="mb-2 h-4 w-1/2" />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <Skeleton className="mb-4 h-6 w-1/4" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    );
  }

  // ── No Trip Assigned State ──────────────────────────────────────────────────
  if (!tripData || !trip || !bus || !route) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto min-h-[60vh] space-y-4">
        <div className="h-16 w-16 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-3xl">
          🚌
        </div>
        <h2 className="text-xl font-bold text-gray-900">No Trip Assigned</h2>
        <p className="text-sm text-gray-500">
          You currently do not have a scheduled or active trip assigned. Please contact
          dispatch or check back prior to your shift.
        </p>
      </div>
    );
  }

  const capacity = bus.capacity || 40;
  const currentOccupancy = telemetry.occupancy?.occupiedSeats ?? bus.occupancy ?? 0;
  const occupancyPercent =
    capacity > 0 ? Math.min(100, Math.max(0, Math.round((currentOccupancy / capacity) * 100))) : 0;
  const progressPercent = Math.min(
    100,
    Math.max(0, telemetry.progress?.routeProgressPercentage || 0),
  );

  // Resolve Next Stop Name
  let nextStopName = 'Next Sequenced Stop';
  if (telemetry.progress?.nextStopId) {
    const foundStop = (route as any).routeStops?.find(
      (rs: any) =>
        rs.stopId === telemetry.progress.nextStopId || rs.stop?.id === telemetry.progress.nextStopId,
    );
    if (foundStop?.stop?.name) {
      nextStopName = foundStop.stop.name;
    }
  } else if (route.stops && route.stops.length > 1) {
    nextStopName = route.stops[1];
  }

  // GPS Status Mapping
  let gpsStatusLabel = 'GPS: OFFLINE';
  let gpsStatusColor: 'success' | 'warning' | 'danger' = 'danger';

  if (status === 'ACTIVE') {
    if (driverGps.gpsSignal === 'LIVE' || telemetry.freshness === 'ACTIVE') {
      gpsStatusLabel = 'GPS: LIVE';
      gpsStatusColor = 'success';
    } else if (driverGps.gpsSignal === 'STALE' || telemetry.freshness === 'STALE') {
      gpsStatusLabel = 'GPS: STALE';
      gpsStatusColor = 'warning';
    } else {
      gpsStatusLabel = 'GPS: OFFLINE';
      gpsStatusColor = 'danger';
    }
  }

  // Delay Status Mapping
  const delayStatus = telemetry.progress?.delayStatus;
  const isDelayed = delayStatus === 'DELAYED';
  const isOnTime = delayStatus === 'ON_TIME';

  return (
    <div className="flex flex-col space-y-6 p-4 max-w-2xl mx-auto pb-24 animate-slide-up">
      {/* Offline Alert Notice */}
      {isOffline && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs font-bold text-amber-900 flex items-center gap-2 shadow-sm">
          <span className="text-base">⚠️</span>
          <span>Device is currently offline. Telemetry will resume once signal reconnects.</span>
        </div>
      )}

      {/* Emergency SOS Active Persistent Banner */}
      {sosActive && (
        <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-4 text-xs font-black text-red-900 flex items-center justify-between shadow-lg animate-pulse">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🚨</span>
            <div>
              <p className="font-extrabold text-sm uppercase tracking-wide text-red-700">
                EMERGENCY SOS ACTIVE
              </p>
              <p className="text-xs font-semibold text-red-800">
                Dispatch and administration alerted. Last known GPS location logged.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSosActive(false)}
            className="text-xs text-red-600 hover:text-red-800 underline font-bold px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toast / Status Alert Banner */}
      {statusMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 flex items-center justify-between shadow-sm">
          <span>{statusMessage}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="ml-3 font-bold text-emerald-600 hover:text-emerald-800 touch-manipulation min-h-[32px] px-2 flex items-center"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          STATE 1: READY / SCHEDULED STATE UI
          Massive START TRIP button. No route progress, live ETA, or GPS streaming.
      ───────────────────────────────────────────────────────────────────────── */}
      {(status === 'READY' || status === 'SCHEDULED') && (
        <div className="flex flex-col space-y-6">
          {/* Trip Overview Card */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
                  Assigned Route
                </span>
                <h1 className="text-2xl font-black text-gray-900 mt-1">{route.name}</h1>
                <p className="text-sm font-semibold text-gray-500 mt-0.5">
                  Bus: {bus.plateNumber || bus.id}
                </p>
              </div>
              <StatusBadge
                status={status === 'READY' ? 'Ready to Start' : 'Scheduled'}
                color="info"
              />
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span className="font-medium">Total Stops:</span>
                <span className="font-bold text-gray-900">
                  {route.stops?.length || (route as any).routeStops?.length || 0} stops
                </span>
              </div>
              {route.stops && route.stops.length > 0 && (
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span className="font-medium">First Stop:</span>
                  <span className="font-bold text-gray-900">{route.stops[0]}</span>
                </div>
              )}
            </div>
          </div>

          {/* Prominent Call to Action */}
          <div className="pt-2">
            <button
              onClick={handleStartTrip}
              disabled={actionLoading === 'start'}
              aria-label="Start Trip"
              className="w-full min-h-[56px] h-16 py-4 px-6 text-lg font-black tracking-wide text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 touch-manipulation cursor-pointer"
            >
              {actionLoading === 'start' ? (
                <span>Starting Trip...</span>
              ) : (
                <>
                  <span className="text-2xl">🚀</span>
                  <span>START TRIP</span>
                </>
              )}
            </button>
            <p className="text-xs text-center text-gray-400 mt-2 font-medium">
              Tap to activate GPS telemetry and passenger tracking.
            </p>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          STATE 2: ACTIVE STATE UI (Operational Console)
          Route Progress Card, Occupancy Card (NO RAW COUNTS), GPS / Delay Status,
          Controls ([END TRIP] in confirmation modal + protected [SOS]).
      ───────────────────────────────────────────────────────────────────────── */}
      {status === 'ACTIVE' && (
        <div className="flex flex-col space-y-5">
          {/* Header Card with Route & GPS Telemetry Status */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
                  Live Operations
                </span>
                <h1 className="text-xl font-black text-gray-900 mt-0.5">{route.name}</h1>
                <p className="text-xs font-semibold text-gray-500">
                  Bus: {bus.plateNumber || bus.id}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status="ACTIVE" color="success" />
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={gpsStatusLabel} color={gpsStatusColor} />
                  {secondsAgo !== null && (
                    <span className="text-[10px] text-gray-400 font-mono">
                      {secondsAgo === 0 ? 'now' : `${secondsAgo}s`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Delay Alert Notification */}
            {isDelayed && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-center gap-2.5 text-xs font-bold text-red-800">
                <span className="text-base">⚠️</span>
                <span>Route Delay Detected: Schedule is running behind standard ETA.</span>
              </div>
            )}
            {isOnTime && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5 flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <span>⏱️</span>
                <span>Schedule: On Time</span>
              </div>
            )}
          </div>

          {/* Route Progress Card */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🛣️</span>
                <h2 className="text-base font-bold text-gray-900">Route Progress</h2>
              </div>
              <span className="text-xs font-bold text-purple-700">
                {progressPercent}% Complete
              </span>
            </div>

            <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold uppercase text-gray-400">
                  Next Scheduled Stop
                </span>
                <p className="text-base font-black text-gray-900">{nextStopName}</p>
              </div>
              {telemetry.progress?.nextStopEtaMinutes !== null &&
                telemetry.progress?.nextStopEtaMinutes !== undefined && (
                  <div className="text-right">
                    <span className="text-xs font-semibold uppercase text-gray-400">ETA</span>
                    <p className="text-lg font-black text-purple-700">
                      {telemetry.progress.nextStopEtaMinutes} min
                    </p>
                  </div>
                )}
            </div>

            {/* Visual Route Completion Bar */}
            <div className="space-y-1.5">
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-purple-600 transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Occupancy Card (STRICT: NO RAW PASSENGER COUNTS) */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">👥</span>
                <h2 className="text-base font-bold text-gray-900">Occupancy</h2>
              </div>
              <span className="text-sm font-extrabold text-gray-900">{occupancyPercent}% Full</span>
            </div>

            {/* Visual Load Bar */}
            <div className="h-3.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  occupancyPercent >= 90
                    ? 'bg-red-500'
                    : occupancyPercent >= 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${occupancyPercent}%` }}
              />
            </div>

            <p className="text-xs text-gray-500 font-medium">
              Load level:{' '}
              <strong className="text-gray-800">
                {occupancyPercent >= 90
                  ? 'High (Standing room only)'
                  : occupancyPercent >= 70
                  ? 'Moderate (Seats filling fast)'
                  : 'Normal capacity'}
              </strong>
            </p>
          </div>

          {/* Controls: [END TRIP] & Accidental-Tap-Protected [SOS] (Touch Targets >= 48px) */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <button
              onClick={() => setShowEndModal(true)}
              disabled={actionLoading === 'end'}
              aria-label="End Trip"
              className="w-full min-h-[48px] h-14 py-3.5 px-4 text-base font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer"
            >
              <span>🏁</span>
              <span>END TRIP</span>
            </button>

            {/* Accidental Tap Protected SOS Button: Press & Hold (2.5s) */}
            <div className="relative w-full">
              <button
                onPointerDown={handleSosHoldStart}
                onPointerUp={handleSosHoldEnd}
                onPointerLeave={handleSosHoldEnd}
                disabled={actionLoading === 'sos'}
                aria-label="Emergency SOS - Press and hold for 2.5 seconds to broadcast distress alert"
                className={`relative overflow-hidden w-full min-h-[48px] h-14 py-3.5 px-4 text-base font-extrabold text-white rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 touch-manipulation select-none cursor-pointer ${
                  sosActive
                    ? 'bg-red-800 ring-2 ring-red-400'
                    : 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                }`}
              >
                {/* Hold to Confirm Animated Background Fill */}
                {isHoldingSos && (
                  <div
                    className="absolute inset-y-0 left-0 bg-red-950/60 transition-all duration-75 ease-linear pointer-events-none"
                    style={{ width: `${sosHoldProgress}%` }}
                  />
                )}

                <span className="relative z-10 text-lg">🚨</span>
                <span className="relative z-10">
                  {isHoldingSos
                    ? `HOLD (${Math.max(1, Math.ceil((HOLD_DURATION_MS * (100 - sosHoldProgress)) / 100000))}s)...`
                    : sosActive
                    ? 'SOS DISPATCHED'
                    : 'HOLD FOR SOS'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          STATE 3: COMPLETED STATE UI
          Neutral "Trip Completed" summary. No tracking, no updates.
      ───────────────────────────────────────────────────────────────────────── */}
      {status === 'COMPLETED' && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-5 text-center">
          <div className="h-16 w-16 mx-auto rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-3xl">
            🏁
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-gray-900">Trip Completed</h2>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              This route has concluded. Telemetry streaming has stopped and passenger logs
              are saved.
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 p-4 border border-gray-100 text-left space-y-2 text-xs text-gray-600">
            <div className="flex justify-between">
              <span className="font-medium">Route:</span>
              <span className="font-bold text-gray-900">{route.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Bus:</span>
              <span className="font-bold text-gray-900">{bus.plateNumber || bus.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Status:</span>
              <StatusBadge status="Concluded" color="neutral" />
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          CONFIRMATION MODAL: END TRIP
          Prevents accidental taps during driving. Touch targets >= 48px.
      ───────────────────────────────────────────────────────────────────────── */}
      {showEndModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
        >
          <div ref={endModalRef} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl mx-auto">
              ⚠️
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-gray-900">Conclude Trip?</h3>
              <p className="text-xs text-gray-500">
                Are you sure you want to end this trip? Telemetry broadcasting and live passenger
                updates will stop immediately.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                onClick={handleConfirmEndTrip}
                disabled={actionLoading === 'end'}
                className="w-full min-h-[48px] h-12 py-3 px-4 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 rounded-xl transition-all touch-manipulation cursor-pointer flex items-center justify-center"
              >
                {actionLoading === 'end' ? 'Ending...' : 'Yes, End Trip'}
              </button>
              <button
                onClick={() => setShowEndModal(false)}
                disabled={actionLoading === 'end'}
                className="w-full min-h-[48px] h-12 py-3 px-4 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl transition-all touch-manipulation cursor-pointer flex items-center justify-center"
              >
                Keep Driving
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          CONFIRMATION MODAL: EMERGENCY SOS
          Accidental Tap Protection Fallback. Touch targets >= 48px.
      ───────────────────────────────────────────────────────────────────────── */}
      {showSosModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl space-y-4 border-2 border-red-500">
            <div className="h-14 w-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-3xl mx-auto animate-bounce">
              🚨
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="text-xl font-black text-red-700 uppercase tracking-wide">
                Confirm Emergency SOS
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                This will instantly alert BTS dispatch and emergency contacts with your last known GPS
                coordinates and vehicle telemetry.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                onClick={handleConfirmSos}
                disabled={actionLoading === 'sos'}
                className="w-full min-h-[48px] h-14 py-3 px-4 text-base font-black text-white bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 rounded-xl shadow-lg transition-all touch-manipulation cursor-pointer flex items-center justify-center gap-2"
              >
                {actionLoading === 'sos' ? (
                  'Transmitting Alert...'
                ) : (
                  <>
                    <span>🚨</span>
                    <span>CONFIRM & TRANSMIT SOS</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setShowSosModal(false)}
                disabled={actionLoading === 'sos'}
                className="w-full min-h-[48px] h-12 py-3 px-4 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl transition-all touch-manipulation cursor-pointer flex items-center justify-center"
              >
                Cancel / False Alarm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
