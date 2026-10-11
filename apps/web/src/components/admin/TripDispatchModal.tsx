'use client';

import React, { useState, useEffect } from 'react';
import {
  getAdminRoutesAction,
  getAdminBusesAction,
  getAdminDriversAction,
  assignAdminTripAction,
} from '@/services/admin.service';
import { Button } from '@bts/ui';

interface TripDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function TripDispatchModal({
  isOpen,
  onClose,
  onSuccess,
}: TripDispatchModalProps) {
  const [routes, setRoutes] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);

  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [selectedBusId, setSelectedBusId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Fetch available routes, buses, and drivers on modal open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingData(true);
    setConflictError(null);
    setSuccessToast(null);

    async function loadDispatchOptions() {
      try {
        const [routesRes, busesRes, driversRes] = await Promise.all([
          getAdminRoutesAction(),
          getAdminBusesAction({ status: 'ACTIVE', limit: 100 }),
          getAdminDriversAction({ limit: 100 }),
        ]);

        if (!isMounted) return;

        const routeList = Array.isArray(routesRes) ? routesRes : routesRes?.data || [];
        const busList = busesRes?.data || [];
        const driverList = driversRes?.data || [];

        setRoutes(routeList);
        setBuses(busList);
        setDrivers(driverList);

        if (routeList.length > 0) setSelectedRouteId(routeList[0].id);
        if (busList.length > 0) setSelectedBusId(busList[0].id);
        if (driverList.length > 0) setSelectedDriverId(driverList[0].id);
      } catch (err) {
        console.error('Failed to load dispatch options:', err);
      } finally {
        if (isMounted) setIsLoadingData(false);
      }
    }

    loadDispatchOptions();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setConflictError(null);

    if (!selectedRouteId || !selectedBusId || !selectedDriverId) {
      setConflictError('Please select a Route, a Bus, and a Driver before dispatching.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await assignAdminTripAction({
        routeId: selectedRouteId,
        busId: selectedBusId,
        driverId: selectedDriverId,
      });

      if (!res.success) {
        // Keep modal open and display backend's 409 ConflictException or validation message
        setConflictError(res.error || 'Assignment conflict detected. Cannot schedule trip.');
        setIsSubmitting(false);
        return;
      }

      setSuccessToast('Trip dispatched successfully! Real-time assignment synchronized.');
      setTimeout(() => {
        setIsSubmitting(false);
        onSuccess?.();
        onClose();
      }, 900);
    } catch (err: any) {
      setConflictError(err.message || 'Network error executing trip dispatch.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispatch-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center space-x-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-2xl">
              🚀
            </span>
            <div>
              <h3 id="dispatch-modal-title" className="text-xl font-black text-gray-900">
                Dispatch Campus Bus Trip
              </h3>
              <p className="text-xs text-gray-500">
                Atomic assignment with transactional conflict validation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Success Toast Banner */}
        {successToast && (
          <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-bold text-emerald-800 animate-fadeIn">
            ✅ {successToast}
          </div>
        )}

        {/* Conflict Notice (409 ConflictException feedback) */}
        {conflictError && (
          <div
            id="dispatch-conflict-error"
            className="mt-4 rounded-2xl border-2 border-rose-400 bg-rose-50 p-4 text-xs text-rose-900 shadow-sm animate-shake"
            role="alert"
          >
            <div className="flex items-start gap-2.5">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-extrabold uppercase tracking-wider text-[11px] text-rose-700">
                  Assignment Conflict Guard
                </p>
                <p className="mt-1 font-semibold leading-relaxed">
                  {conflictError}
                </p>
                <p className="mt-1 text-[11px] text-rose-600 font-normal">
                  The driver or vehicle selected is already assigned to a concurrent ACTIVE or READY trip. Please select an available alternative.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleDispatch} className="mt-5 space-y-4">
          {isLoadingData ? (
            <div className="space-y-4 py-8 text-center text-xs text-gray-400">
              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              <p>Loading available verified routes, fleet buses, and drivers...</p>
            </div>
          ) : (
            <>
              {/* 1. Route Selector */}
              <div className="space-y-1.5">
                <label htmlFor="select-route" className="block text-xs font-bold text-gray-700">
                  Select Route <span className="text-rose-500">*</span>
                </label>
                <select
                  id="select-route"
                  value={selectedRouteId}
                  onChange={(e) => setSelectedRouteId(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-3 text-xs font-semibold text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                  disabled={isSubmitting}
                  required
                  aria-describedby={conflictError ? 'dispatch-conflict-error' : undefined}
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.routeStops?.length ? `(${r.routeStops.length} stops)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Bus Selector */}
              <div className="space-y-1.5">
                <label htmlFor="select-bus" className="block text-xs font-bold text-gray-700">
                  Select Vehicle / Bus <span className="text-rose-500">*</span>
                </label>
                <select
                  id="select-bus"
                  value={selectedBusId}
                  onChange={(e) => setSelectedBusId(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-3 text-xs font-semibold text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                  disabled={isSubmitting}
                  required
                  aria-describedby={conflictError ? 'dispatch-conflict-error' : undefined}
                >
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.plateNumber} — {b.model || 'Bus'} ({b.capacity} seats) {b.activeTrip ? '⚠️ [On Route]' : '🟢 [Available]'}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400">
                  Active vehicles only. Assigning a vehicle with an active trip will be rejected.
                </p>
              </div>

              {/* 3. Driver Selector */}
              <div className="space-y-1.5">
                <label htmlFor="select-driver" className="block text-xs font-bold text-gray-700">
                  Select Driver <span className="text-rose-500">*</span>
                </label>
                <select
                  id="select-driver"
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-3 text-xs font-semibold text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                  disabled={isSubmitting}
                  required
                  aria-describedby={conflictError ? 'dispatch-conflict-error' : undefined}
                >
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name || d.licenseNumber} ({d.licenseNumber}) {d.activeTrip ? '⚠️ [On Route]' : '🟢 [Available]'}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400">
                  Assigning a driver with an active trip will be rejected by the integrity engine.
                </p>
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div className="mt-6 flex items-center justify-end space-x-3 pt-3 border-t border-gray-100">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-gray-300 font-bold text-gray-700"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isSubmitting || isLoadingData}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-gray-950 shadow-md"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
                  Asserting Integrity...
                </span>
              ) : (
                'Dispatch Trip'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
