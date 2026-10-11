'use client';

import React, { useState, useEffect } from 'react';
import { getAdminRoutesAction } from '@/services/admin.service';
import { StatusBadge, Skeleton, EmptyState, Button } from '@bts/ui';

interface RouteStopItem {
  id: string;
  sequence: number;
  scheduledTime: string | null;
  stop: {
    id: string;
    name: string;
    lat: number | null;
    lng: number | null;
    description: string | null;
    geofence?: {
      radius: number;
    } | null;
  };
}

interface RouteItem {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  routeStops: RouteStopItem[];
}

export default function AdminRoutesPage() {
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [stopSearch, setStopSearch] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fetchRoutes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminRoutesAction();
      if (Array.isArray(data)) {
        setRoutes(data);
        if (data.length > 0 && !selectedRouteId) {
          setSelectedRouteId(data[0].id);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load verified BMSIT routes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0] || null;

  const filteredStops = selectedRoute?.routeStops
    ? selectedRoute.routeStops.filter((rs) => {
        if (!stopSearch.trim()) return true;
        const q = stopSearch.toLowerCase();
        return (
          rs.stop.name.toLowerCase().includes(q) ||
          (rs.stop.description && rs.stop.description.toLowerCase().includes(q))
        );
      })
    : [];

  const totalStopsCount = routes.reduce((acc, r) => acc + (r.routeStops?.length || 0), 0);

  return (
    <div className="flex flex-col space-y-6 animate-slide-up">
      {/* 1. Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Verified Institutional Route Directory
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 border border-emerald-300">
              ✓ Verified Dataset
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Read-only inspection of the 9 official BMSIT campus transit corridors, stop sequences, and geofence radii
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={fetchRoutes}
          disabled={isLoading}
          className="rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 self-start sm:self-auto"
        >
          {isLoading ? 'Updating...' : '🔄 Refresh Routes'}
        </Button>
      </div>

      {/* 2. Error Banner */}
      {error && (
        <div
          className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs font-bold text-rose-800 shadow-sm"
          role="alert"
        >
          ⚠️ {error}
        </div>
      )}

      {/* 3. Safety Notice Banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 shadow-sm">
        <span className="text-base">🔒</span>
        <div className="space-y-0.5">
          <p className="font-bold">Strict Read-Only Integrity Enforcement</p>
          <p className="text-blue-800 text-[11px]">
            To guarantee 100% precision for telemetry calculations, geofence boundary detection, and ETA predictions, all 9 institutional route corridors are cryptographically preserved against arbitrary alterations.
          </p>
        </div>
      </div>

      {/* 4. Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold text-gray-500">Active Corridors</div>
          <div className="mt-1 text-2xl font-black text-gray-900">{routes.length} Verified</div>
          <div className="mt-1 text-[11px] text-gray-400">Routes 02, 03, 04, 06, 07, 08, 09, 10, 11</div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold text-gray-500">Total Route Stops</div>
          <div className="mt-1 text-2xl font-black text-gray-900">{totalStopsCount} Stops</div>
          <div className="mt-1 text-[11px] text-gray-400">Monitored institutional board/drop nodes</div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold text-gray-500">Geofence Boundary</div>
          <div className="mt-1 text-2xl font-black text-emerald-600">50m Radius</div>
          <div className="mt-1 text-[11px] text-gray-400">Automated dwell detection &amp; stop sequence tracking</div>
        </div>
      </div>

      {/* 5. Route Selection & Stop Sequence Inspector */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : routes.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <EmptyState
            title="No routes configured"
            description="No transit routes are currently registered in the database."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column: Route Selector List */}
          <div className="space-y-2 lg:col-span-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Verified Routes ({routes.length})
            </h3>
            <div className="space-y-1.5 overflow-y-auto max-h-[600px] pr-1">
              {routes.map((route) => {
                const isSelected = route.id === selectedRoute?.id;
                return (
                  <button
                    key={route.id}
                    onClick={() => {
                      setSelectedRouteId(route.id);
                      setStopSearch('');
                    }}
                    className={`w-full rounded-2xl border p-3.5 text-left transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/50 shadow-sm ring-1 ring-amber-500'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-gray-900 text-xs">
                        {route.name}
                      </span>
                      <StatusBadge
                        status={route.active ? 'ACTIVE' : 'INACTIVE'}
                        color={route.active ? 'success' : 'neutral'}
                      />
                    </div>
                    {route.description && (
                      <p className="mt-1 text-[11px] text-gray-500 line-clamp-1">
                        {route.description}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400 font-medium">
                      <span>{route.routeStops?.length || 0} Ordered Stops</span>
                      <span className="font-mono">ID: {route.id.slice(-6)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Ordered Stop Sequences */}
          <div className="space-y-4 lg:col-span-2">
            {selectedRoute && (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
                {/* Route Header */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-gray-900">
                      {selectedRoute.name}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selectedRoute.description || 'Institutional Campus Route'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-xl bg-gray-100 px-3 py-1 text-xs font-extrabold text-gray-700">
                      {selectedRoute.routeStops?.length || 0} Total Stops
                    </span>
                  </div>
                </div>

                {/* Stop Search Input */}
                <div className="relative">
                  <input
                    type="text"
                    value={stopSearch}
                    onChange={(e) => setStopSearch(e.target.value)}
                    placeholder="Search stops within this route..."
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-sm"
                  />
                  {stopSearch && (
                    <button
                      onClick={() => setStopSearch('')}
                      className="absolute right-3 top-2 text-xs text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Stop Sequence Table */}
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600">
                      <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        <tr>
                          <th scope="col" className="px-4 py-3">Sequence</th>
                          <th scope="col" className="px-4 py-3">Stop Name</th>
                          <th scope="col" className="px-4 py-3">Scheduled Time</th>
                          <th scope="col" className="px-4 py-3">GPS Coordinates</th>
                          <th scope="col" className="px-4 py-3 text-right">Geofence Radius</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredStops.map((rs) => {
                          const radius = rs.stop.geofence?.radius ?? 50;

                          return (
                            <tr key={rs.id} className="transition-colors hover:bg-gray-50/70">
                              {/* Sequence */}
                              <td className="px-4 py-3">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-black text-amber-900">
                                  {rs.sequence}
                                </span>
                              </td>

                              {/* Stop Name */}
                              <td className="px-4 py-3">
                                <div className="font-bold text-gray-900 text-xs">
                                  {rs.stop.name}
                                </div>
                                {rs.stop.description && (
                                  <div className="text-[11px] text-gray-400">
                                    {rs.stop.description}
                                  </div>
                                )}
                              </td>

                              {/* Scheduled Time */}
                              <td className="px-4 py-3">
                                {rs.scheduledTime ? (
                                  <span className="font-mono text-xs font-semibold text-gray-800">
                                    {rs.scheduledTime}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400 italic">Dynamic</span>
                                )}
                              </td>

                              {/* Coordinates */}
                              <td className="px-4 py-3 font-mono text-xs text-gray-600">
                                {rs.stop.lat !== null && rs.stop.lng !== null ? (
                                  <span>
                                    {Number(rs.stop.lat).toFixed(5)}, {Number(rs.stop.lng).toFixed(5)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 italic">Unmapped</span>
                                )}
                              </td>

                              {/* Geofence Radius */}
                              <td className="px-4 py-3 text-right">
                                <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-mono font-bold text-emerald-700 border border-emerald-200">
                                  {radius}m
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
