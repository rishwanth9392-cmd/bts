'use client';

import React, { useState } from 'react';
import { useAdminFleet } from '@/hooks/useAdminFleet';
import { FleetOverviewCards } from '@/components/admin/FleetOverviewCards';
import { EmergencySosBanner } from '@/components/admin/EmergencySosBanner';
import { LiveTripOperationsTable } from '@/components/admin/LiveTripOperationsTable';
import { TripDispatchModal } from '@/components/admin/TripDispatchModal';
import { Button } from '@bts/ui';

export default function AdminDashboardPage() {
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState<boolean>(false);
  const {
    fleetStatus,
    trips,
    sosAlerts,
    isLoading,
    error,
    isWsConnected,
    activeFilter,
    setActiveFilter,
    revalidate,
    cancelTrip,
    acknowledgeSos,
  } = useAdminFleet();

  return (
    <div className="flex flex-col space-y-8 animate-slide-up">
      {/* 1. Header Bar with Dispatch Status & Manual Refresh */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Fleet Operations Command Center
            </h1>
            {/* Live Socket Badge */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isWsConnected
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isWsConnected ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'
                }`}
              />
              {isWsConnected ? 'Live Socket Dispatch' : '10s Sync Fallback'}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Real-time telemetry, vehicle occupancy, dispatch safety guards, and emergency incident monitoring
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => revalidate()}
            disabled={isLoading}
            className="rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                Updating...
              </span>
            ) : (
              '🔄 Refresh Feeds'
            )}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsDispatchModalOpen(true)}
            className="rounded-xl bg-amber-500 hover:bg-amber-600 font-bold text-gray-950 shadow-md text-xs"
          >
            🚀 Dispatch Trip
          </Button>
        </div>
      </div>

      {/* 2. Error Banner if communication fails */}
      {error && (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800 shadow-sm"
          role="alert"
        >
          ⚠️ Dispatch Communication Notice: {error}
        </div>
      )}

      {/* 3. High-Visibility Emergency SOS Banner */}
      <EmergencySosBanner
        alerts={sosAlerts}
        onAcknowledge={acknowledgeSos}
      />

      {/* 4. Fleet Overview & Telemetry Status Cards */}
      <section aria-labelledby="fleet-overview-title">
        <h2 id="fleet-overview-title" className="sr-only">
          Fleet Telemetry & Status Overview
        </h2>
        <FleetOverviewCards status={fleetStatus} isLoading={isLoading} />
      </section>

      {/* 5. Live Trip Operations Table */}
      <section aria-labelledby="trip-operations-title">
        <h2 id="trip-operations-title" className="sr-only">
          Live Trip Operations Table
        </h2>
        <LiveTripOperationsTable
          trips={trips}
          isLoading={isLoading}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onCancelTrip={cancelTrip}
        />
      </section>

      {/* 6. Trip Dispatch Modal */}
      <TripDispatchModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        onSuccess={() => {
          revalidate();
        }}
      />
    </div>
  );
}
