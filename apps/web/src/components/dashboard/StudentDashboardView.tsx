'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { PickupAssignmentDetail } from '@bts/shared';
import type { StudentProfile } from '@/services/student.service';
import { Button } from '@bts/ui';
import { removeMyPickup } from '@/services/student.service';
import { useTripTelemetry } from '@/hooks/useTripTelemetry';
import { useStudentEvents } from '@/hooks/useStudentEvents';
import { confirmBoarding, checkOutDrop } from '@/services/boarding.service';
import { UberTrackingMap } from './UberTrackingMap';

interface ActiveTripSummary {
  id?: string;
  bus?: {
    capacity?: number;
  };
  calculatedOccupancy?: number;
}

interface StudentDashboardViewProps {
  initialProfile: StudentProfile | null;
  initialPickup: PickupAssignmentDetail | null;
  initialActiveTrip?: ActiveTripSummary | null;
}

function computeHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function StudentDashboardView({
  initialProfile,
  initialPickup,
  initialActiveTrip,
}: StudentDashboardViewProps) {
  const [activeTrip] = useState<ActiveTripSummary | null>(initialActiveTrip || null);
  const telemetry = useTripTelemetry(activeTrip?.id);
  const { arrivalPrompt, dismissPrompt, eta: studentEta } = useStudentEvents(initialProfile?.id);
  const [pickup, setPickup] = useState<PickupAssignmentDetail | null>(initialPickup);

  // Recenter signal to map
  const [recenterAction, setRecenterAction] = useState<{
    target: 'bus' | 'stop' | 'route';
    timestamp: number;
  } | null>(null);

  // Modals & Operation state
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [isBoarding, setIsBoarding] = useState(false);
  const [boardingState, setBoardingState] = useState<'IDLE' | 'BOARDED' | 'CHECKED_OUT'>('IDLE');
  const [boardingError, setBoardingError] = useState<string | null>(null);

  const [isConfirmingCheckout, setIsConfirmingCheckout] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Modal focus traps
  const removeModalRef = useRef<HTMLDivElement>(null);
  const checkoutModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isConfirmingRemove && !isRemoving) setIsConfirmingRemove(false);
        if (isConfirmingCheckout && !isCheckingOut) setIsConfirmingCheckout(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConfirmingRemove, isRemoving, isConfirmingCheckout, isCheckingOut]);

  // Derived Stop and Vehicle Geometry
  const pickupStop = useMemo(() => {
    if (!pickup?.stop?.lat || !pickup?.stop?.lng) return null;
    return {
      lat: pickup.stop.lat,
      lng: pickup.stop.lng,
      name: pickup.stop.name,
    };
  }, [pickup]);

  const routeStops = useMemo(() => {
    return pickup?.route?.routeStops || [];
  }, [pickup]);

  // Distance computation
  const distanceToStop = useMemo(() => {
    if (arrivalPrompt?.distanceMeters != null) {
      return arrivalPrompt.distanceMeters;
    }
    if (
      telemetry.latitude != null &&
      telemetry.longitude != null &&
      pickupStop?.lat != null &&
      pickupStop?.lng != null
    ) {
      return computeHaversineDistanceMeters(
        telemetry.latitude,
        telemetry.longitude,
        pickupStop.lat,
        pickupStop.lng,
      );
    }
    return 9999;
  }, [arrivalPrompt, telemetry.latitude, telemetry.longitude, pickupStop]);

  const isWithin50m = distanceToStop <= 50;
  const distanceKm = (distanceToStop / 1000).toFixed(1);
  const speed = telemetry.speed != null ? Math.round(telemetry.speed) : 0;

  // ETA Calculation
  const etaMinutes = useMemo(() => {
    if (studentEta.state === 'AVAILABLE' && studentEta.etaMinutes != null) {
      return studentEta.etaMinutes;
    }
    if (telemetry.latitude != null && pickupStop?.lat != null) {
      return Math.max(1, Math.round(distanceToStop / 500));
    }
    return 6;
  }, [studentEta, telemetry.latitude, pickupStop, distanceToStop]);

  // Micro Route Progression Stops
  const { currentStopName, nextStopName, designatedStopName } = useMemo(() => {
    const sorted = [...routeStops].sort((a, b) => a.sequence - b.sequence);
    const curr = sorted.find((s) => s.stopId === telemetry.progress?.previousStopId);
    const next = sorted.find((s) => s.stopId === telemetry.progress?.nextStopId);

    return {
      currentStopName: curr?.stop?.name || (sorted.length > 0 ? sorted[0].stop.name : 'Origin Depot'),
      nextStopName: next?.stop?.name || (sorted.length > 1 ? sorted[1].stop.name : 'En Route'),
      designatedStopName: pickup?.stop?.name || 'Your Stop',
    };
  }, [routeStops, telemetry.progress, pickup]);

  // Occupancy Invariant: Percentage only, Strictly NO raw headcounts
  const busCapacity = activeTrip?.bus?.capacity || 40;
  const currentOccupancy = telemetry.occupancy?.occupiedSeats ?? activeTrip?.calculatedOccupancy ?? 0;
  const occupancyPercent =
    busCapacity > 0 ? Math.min(100, Math.round((currentOccupancy / busCapacity) * 100)) : 0;

  const seatConfig = useMemo(() => {
    if (occupancyPercent < 60) {
      return {
        label: 'Seats Available',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800',
        bar: 'bg-emerald-500',
      };
    }
    if (occupancyPercent < 90) {
      return {
        label: 'Moderate Seating',
        badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800',
        bar: 'bg-amber-500',
      };
    }
    return {
      label: 'Standing Room Only',
      badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800',
      bar: 'bg-rose-500',
    };
  }, [occupancyPercent]);

  // Boarding Actions
  const handleConfirmBoarding = async () => {
    const tripId = activeTrip?.id || arrivalPrompt?.tripId;
    if (!tripId) return;

    setIsBoarding(true);
    setBoardingError(null);
    try {
      const res = await confirmBoarding(tripId);
      if (res.success || res.error === 'Already Boarded') {
        setBoardingState('BOARDED');
        dismissPrompt();
      } else {
        setBoardingError(res.error || 'Failed to confirm boarding.');
      }
    } catch {
      setBoardingError('Network error confirming boarding. Please check your connection.');
    } finally {
      setIsBoarding(false);
    }
  };

  const handleConfirmCheckout = async () => {
    const targetTripId = activeTrip?.id || arrivalPrompt?.tripId;
    if (!targetTripId) {
      setCheckoutError('No active trip detected to check out from.');
      return;
    }

    setIsCheckingOut(true);
    setCheckoutError(null);
    try {
      const res = await checkOutDrop(targetTripId);
      if (res.success || res.error === 'Already Checked Out') {
        setBoardingState('CHECKED_OUT');
        setIsConfirmingCheckout(false);
      } else {
        setCheckoutError(res.error || 'Failed to complete checkout.');
      }
    } catch {
      setCheckoutError('Network error during checkout. Please check your connection.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleConfirmRemove = async () => {
    setIsRemoving(true);
    setRemoveError(null);
    try {
      const res = await removeMyPickup();
      if (res.success) {
        setPickup(null);
        setIsConfirmingRemove(false);
      } else {
        setRemoveError(res.error || 'Failed to remove pickup assignment.');
      }
    } catch {
      setRemoveError('A network error occurred. Please check your connection.');
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950 select-none">
      {/* 1. Edge-to-Edge Map Canvas Layout */}
      <div className="w-full h-screen absolute inset-0 z-0">
        <UberTrackingMap
          vehicleLat={telemetry.latitude}
          vehicleLng={telemetry.longitude}
          heading={telemetry.heading}
          speed={telemetry.speed}
          freshness={telemetry.freshness}
          routeStops={routeStops}
          pickupStop={pickupStop}
          recenterAction={recenterAction}
        />
      </div>

      {/* 2. Floating Header Overlays (Zomato-Style) */}
      <div className="fixed top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        {/* Left: Route selector frosted pill */}
        <Link
          href="/student/routes"
          className="pointer-events-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-slate-200 dark:border-slate-800 text-sm font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-800 transition active:scale-95"
          aria-label="Select or Change Campus Transit Route"
        >
          <span className="text-base">🚌</span>
          <span className="truncate max-w-[130px] sm:max-w-[200px]">
            {pickup?.route?.name || 'Select Route'}
          </span>
          <svg
            className="w-4 h-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </Link>

        {/* Right: Live status pill */}
        <div className="pointer-events-auto" aria-live="polite" aria-atomic="true">
          {telemetry.freshness === 'ACTIVE' ? (
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-emerald-200 dark:border-emerald-800 text-sm font-semibold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span>
                Live Tracking
                {studentEta.state === 'AVAILABLE' && studentEta.etaMinutes != null
                  ? ` (${studentEta.etaMinutes} mins)`
                  : ` (${etaMinutes} mins)`}
              </span>
            </div>
          ) : telemetry.freshness === 'STALE' ? (
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-amber-200 dark:border-amber-800 text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span>Signal Stale</span>
            </div>
          ) : (
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-slate-200 dark:border-slate-800 text-sm font-semibold flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
              <span>Offline / Last Known Location</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Floating Action Buttons (Recenter) */}
      <div className="fixed right-4 bottom-[320px] z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setRecenterAction({ target: 'bus', timestamp: Date.now() })}
          aria-label="Recenter Map on Bus"
          title="Recenter Bus"
          className="h-11 w-11 rounded-full bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"
        >
          <span className="text-lg">🚌</span>
        </button>
        <button
          type="button"
          onClick={() => setRecenterAction({ target: 'stop', timestamp: Date.now() })}
          aria-label="Recenter Map on My Pickup Stop"
          title="Recenter My Stop"
          className="h-11 w-11 rounded-full bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"
        >
          <span className="text-lg">🚏</span>
        </button>
      </div>

      {/* 4. Interactive Bottom Sheet (Uber-Style) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl border-t border-slate-200/80 dark:border-slate-800/80 p-5 max-w-lg mx-auto transition-transform duration-300">
        {/* Drag handle */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3" />

        {!pickup ? (
          /* Empty State if no pickup selected */
          <div className="text-center py-3 space-y-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-2xl text-indigo-600 dark:text-indigo-400">
              📍
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                No Pickup Selected
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                Choose your daily campus transit route and stop to unlock live ride tracking and automated geofence boarding.
              </p>
            </div>
            <div className="pt-1">
              <Link href="/student/routes">
                <Button variant="primary" size="lg" className="w-full font-bold shadow-md touch-manipulation">
                  Find My Route
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          /* Active Transit Ride Tracking Sheet */
          <div className="space-y-4">
            {/* Headline Arrival Stat */}
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h2 className="font-extrabold text-2xl tracking-tight text-slate-900 dark:text-white">
                  {studentEta.state === 'PASSED'
                    ? 'Pickup Passed'
                    : studentEta.state === 'CALCULATING'
                    ? 'Calculating ETA...'
                    : activeTrip
                    ? `Arriving in ${etaMinutes} mins`
                    : 'Awaiting Trip Start'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {pickup.route.name} • {pickup.stop.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {distanceKm} km away • {speed} km/h
                </p>
                {telemetry.progress?.delayStatus === 'DELAYED' && (
                  <span className="inline-flex items-center text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 mt-0.5">
                    ⚠️ ~10+ min delay
                  </span>
                )}
              </div>
            </div>

            {/* Micro Route Progression */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2.5 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-1 overflow-x-auto">
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-medium text-slate-400 text-[11px]">Current:</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 truncate text-[11px]">
                  {currentStopName}
                </span>
              </div>
              <span className="text-slate-400 font-bold shrink-0 text-xs">→</span>
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-medium text-slate-400 text-[11px]">Next:</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 truncate text-[11px]">
                  {nextStopName}
                </span>
              </div>
              <span className="text-slate-400 font-bold shrink-0 text-xs">→</span>
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-medium text-indigo-500 text-[11px]">Your Stop:</span>
                <span className="font-extrabold text-indigo-600 dark:text-indigo-400 truncate text-[11px]">
                  {designatedStopName}
                </span>
              </div>
            </div>

            {/* Seat Load Card (Strictly Percentage Only, Zero Raw Headcounts) */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">💺</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Bus Capacity: {occupancyPercent}% Full
                  </span>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-extrabold border ${seatConfig.badge}`}
                >
                  {seatConfig.label}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${seatConfig.bar}`}
                  style={{ width: `${occupancyPercent}%` }}
                />
              </div>
            </div>

            {/* Error Banners if any */}
            {boardingError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-bold text-red-800 flex items-center justify-between">
                <span>{boardingError}</span>
                <button
                  onClick={() => setBoardingError(null)}
                  className="text-red-600 hover:text-red-900 font-bold ml-2"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Contextual Action CTA */}
            {boardingState === 'BOARDED' ? (
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  setCheckoutError(null);
                  setIsConfirmingCheckout(true);
                }}
                className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl bg-primary-yellow hover:brightness-105 text-slate-950 font-black text-sm shadow-lg shadow-amber-400/20 active:scale-[0.99] transition touch-manipulation flex items-center justify-center gap-2"
              >
                🏁 I&apos;ve Reached My Stop
              </Button>
            ) : boardingState === 'CHECKED_OUT' ? (
              <button
                type="button"
                disabled
                className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold text-sm cursor-not-allowed border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center gap-2"
              >
                🏁 Trip Concluded
              </button>
            ) : isWithin50m || arrivalPrompt ? (
              <Button
                variant="primary"
                size="lg"
                disabled={isBoarding}
                onClick={handleConfirmBoarding}
                className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-lg shadow-emerald-600/30 active:scale-[0.99] transition touch-manipulation flex items-center justify-center gap-2"
              >
                {isBoarding ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Confirming Boarding...</span>
                  </span>
                ) : (
                  <span>✅ Confirm Boarding</span>
                )}
              </Button>
            ) : (
              <button
                type="button"
                disabled
                className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-bold text-sm cursor-not-allowed border border-slate-200/60 dark:border-slate-700/60 transition flex items-center justify-center gap-2"
              >
                Approaching Stop ({distanceToStop > 1000 ? `${(distanceToStop / 1000).toFixed(1)}km` : `${distanceToStop}m`} away)
              </button>
            )}

            {/* Quick Actions & Navigation Link Row */}
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 pt-1 px-1">
              <Link
                href="/student/routes"
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition"
              >
                Change Stop
              </Link>
              <span>•</span>
              <button
                type="button"
                onClick={() => {
                  setRemoveError(null);
                  setIsConfirmingRemove(true);
                }}
                className="hover:text-rose-600 transition"
              >
                Remove Pickup
              </button>
              <span>•</span>
              <Link
                href="/student/boarding"
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition"
              >
                Pass
              </Link>
              <span>•</span>
              <Link
                href="/student/notifications"
                className="hover:text-indigo-600 dark:hover:text-indigo-400 transition"
              >
                Alerts
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Remove Confirmation Modal */}
      {isConfirmingRemove && pickup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            ref={removeModalRef}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4 animate-scale-up border border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-center gap-3 text-red-600">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/60 text-xl">
                🗑️
              </span>
              <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                  Remove Pickup Stop?
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">{pickup.route.name}</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200 dark:border-slate-700 space-y-1">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Are you sure you want to remove your assigned pickup at{' '}
                <span className="font-extrabold text-slate-900 dark:text-white">
                  {pickup.stop.name}
                </span>
                ?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live vehicle tracking for this route will be dismissed until you choose a stop again.
              </p>
            </div>

            {removeError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">
                {removeError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="md"
                disabled={isRemoving}
                onClick={() => {
                  if (!isRemoving) setIsConfirmingRemove(false);
                }}
              >
                Cancel
              </Button>

              <Button
                variant="danger"
                size="md"
                disabled={isRemoving}
                onClick={handleConfirmRemove}
                className="min-w-[120px]"
              >
                {isRemoving ? 'Removing...' : 'Remove Pickup'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Drop Checkout Confirmation Modal */}
      {isConfirmingCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            ref={checkoutModalRef}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4 animate-scale-up border border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-center gap-3 text-amber-600">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60 text-2xl">
                🚏
              </span>
              <div>
                <h4 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Confirm Drop Checkout
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pickup?.route.name || 'Campus Transit'}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200 dark:border-slate-700 space-y-2">
              <p className="text-base font-bold text-slate-800 dark:text-slate-200">
                Confirm you have left the bus?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                This will record your drop checkout, release your seat on the bus occupancy manifest, and conclude transit tracking.
              </p>
            </div>

            {checkoutError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">
                {checkoutError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="lg"
                disabled={isCheckingOut}
                onClick={() => {
                  if (!isCheckingOut) setIsConfirmingCheckout(false);
                }}
                className="min-h-[48px] touch-manipulation font-semibold"
              >
                Cancel
              </Button>

              <Button
                variant="primary"
                size="lg"
                disabled={isCheckingOut}
                onClick={handleConfirmCheckout}
                className="min-h-[48px] min-w-[150px] font-bold touch-manipulation shadow-md bg-primary-yellow hover:brightness-105 text-slate-950"
              >
                {isCheckingOut ? 'Checking Out...' : 'Confirm & Check Out'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
