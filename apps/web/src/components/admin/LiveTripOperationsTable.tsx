'use client';

import React, { useState } from 'react';
import type { AdminTripItem } from '@/hooks/useAdminFleet';
import { StatusBadge, Skeleton, EmptyState, Button } from '@bts/ui';
import { TripCancellationModal } from './TripCancellationModal';

interface LiveTripOperationsTableProps {
  trips: AdminTripItem[];
  isLoading: boolean;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  onCancelTrip: (tripId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
}

export function LiveTripOperationsTable({
  trips,
  isLoading,
  activeFilter,
  onFilterChange,
  onCancelTrip,
}: LiveTripOperationsTableProps) {
  const [selectedTripForCancel, setSelectedTripForCancel] = useState<AdminTripItem | null>(null);

  const filters = [
    { key: 'ALL', label: 'All Trips' },
    { key: 'ACTIVE', label: 'Active Transit' },
    { key: 'SCHEDULED', label: 'Scheduled' },
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'CANCELLED', label: 'Cancelled' },
  ];

  return (
    <div className="flex flex-col space-y-4">
      {/* Table Header & Filter Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-black text-gray-900">Live Trip Operations</h3>
          <p className="text-xs text-gray-500">
            Real-time route dispatches, vehicle occupancy, and telemetry tracking
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-gray-100/70 p-1">
          {filters.map((f) => {
            const isActive = activeFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => onFilterChange(f.key)}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : trips.length === 0 ? (
        /* Empty State */
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <EmptyState
            title={activeFilter === 'ACTIVE' ? 'No active trips currently in transit' : 'No trips found'}
            description={
              activeFilter === 'ACTIVE'
                ? 'All scheduled campus routes have completed or are waiting at origin terminals.'
                : 'No trips match the selected status filter.'
            }
          />
        </div>
      ) : (
        /* Table Grid */
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Route</th>
                  <th scope="col" className="px-5 py-3.5">Bus Plate</th>
                  <th scope="col" className="px-5 py-3.5">Driver</th>
                  <th scope="col" className="px-5 py-3.5">Trip Status</th>
                  <th scope="col" className="px-5 py-3.5">Telemetry Freshness</th>
                  <th scope="col" className="px-5 py-3.5">Occupancy</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trips.map((trip) => {
                  const isCancellable =
                    trip.status === 'ACTIVE' ||
                    trip.status === 'READY' ||
                    trip.status === 'SCHEDULED';

                  // Status Badge Color
                  let statusColor: 'success' | 'warning' | 'danger' | 'info' | 'neutral' = 'neutral';
                  if (trip.status === 'ACTIVE') statusColor = 'success';
                  else if (trip.status === 'READY') statusColor = 'info';
                  else if (trip.status === 'SCHEDULED') statusColor = 'warning';
                  else if (trip.status === 'CANCELLED') statusColor = 'danger';

                  // Telemetry Badge
                  const telemetryStatus = trip.telemetry?.status;
                  const freshnessSec = trip.telemetry?.freshnessSeconds;

                  // Occupancy values
                  const occupancy = trip.occupancy || { current: 0, capacity: 40, percentage: 0 };
                  const occupancyPercentage = occupancy.percentage;

                  let occupancyColor = 'bg-emerald-500';
                  if (occupancyPercentage >= 90) occupancyColor = 'bg-rose-500';
                  else if (occupancyPercentage >= 70) occupancyColor = 'bg-amber-500';

                  return (
                    <tr
                      key={trip.id}
                      className="transition-colors hover:bg-gray-50/70"
                    >
                      {/* Route */}
                      <td className="px-5 py-4">
                        <div className="font-extrabold text-gray-900">
                          {trip.route?.name || 'Unassigned Route'}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono">
                          ID: {trip.route?.id?.slice(-8) || 'N/A'}
                        </div>
                      </td>

                      {/* Bus Plate */}
                      <td className="px-5 py-4">
                        <div className="font-bold text-gray-900">
                          {trip.bus?.plateNumber || 'No Plate'}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {trip.bus?.model || `${trip.bus?.capacity || 40} seats`}
                        </div>
                      </td>

                      {/* Driver */}
                      <td className="px-5 py-4">
                        <div className="font-bold text-gray-900">
                          {trip.driver?.name || trip.driver?.licenseNumber || 'Driver'}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {trip.driver?.phone || trip.driver?.email || 'No contact info'}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <StatusBadge
                          status={trip.status}
                          color={statusColor}
                        />
                      </td>

                      {/* Telemetry Freshness */}
                      <td className="px-5 py-4">
                        {trip.status === 'ACTIVE' ? (
                          telemetryStatus === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              Live ({freshnessSec ?? 0}s)
                            </span>
                          ) : telemetryStatus === 'STALE' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                              <span className="h-2 w-2 rounded-full bg-amber-500" />
                              Stale ({freshnessSec ?? 0}s)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200">
                              <span className="h-2 w-2 rounded-full bg-rose-500" />
                              Offline
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-gray-400 font-mono">—</span>
                        )}
                      </td>

                      {/* Occupancy */}
                      <td className="px-5 py-4">
                        <div className="w-36 space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="font-bold text-gray-700">
                              {occupancyPercentage}% Full
                            </span>
                            <span className="text-gray-400">
                              {occupancy.current}/{occupancy.capacity}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={`h-full ${occupancyColor} transition-all duration-300`}
                              style={{ width: `${Math.min(100, occupancyPercentage)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        {isCancellable ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-xs font-bold border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                            onClick={() => setSelectedTripForCancel(trip)}
                          >
                            Cancel Trip
                          </Button>
                        ) : (
                          <span className="text-xs text-gray-400 font-mono">—</span>
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

      {/* Trip Cancellation Guard Modal */}
      <TripCancellationModal
        trip={selectedTripForCancel}
        isOpen={Boolean(selectedTripForCancel)}
        onClose={() => setSelectedTripForCancel(null)}
        onConfirm={onCancelTrip}
      />
    </div>
  );
}
