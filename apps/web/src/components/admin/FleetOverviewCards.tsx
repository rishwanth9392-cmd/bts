'use client';

import React from 'react';
import type { FleetStatusData } from '@/hooks/useAdminFleet';
import { Skeleton } from '@bts/ui';

interface FleetOverviewCardsProps {
  status: FleetStatusData | null;
  isLoading: boolean;
}

export function FleetOverviewCards({ status, isLoading }: FleetOverviewCardsProps) {
  if (isLoading || !status) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const activeTripsCount = status.trips?.active ?? 0;
  const upcomingTripsCount = (status.trips?.scheduled ?? 0) + (status.trips?.ready ?? 0);
  const unacknowledgedSos = status.safety?.unacknowledgedSosCount ?? 0;
  const { active: liveCount, stale: staleCount, offline: offlineCount } = status.telemetry ?? {
    active: 0,
    stale: 0,
    offline: 0,
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Active Trips Counter */}
      <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Active Trips
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            🚍
          </span>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-3xl font-extrabold text-gray-900">{activeTripsCount}</span>
          <span className="text-xs font-semibold text-emerald-600">
            Live on routes
          </span>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Total Fleet: {status.fleet?.totalBuses ?? 0} buses ({status.fleet?.activeBuses ?? 0} active)
        </div>
      </div>

      {/* 2. Scheduled / Ready Counter */}
      <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Upcoming Trips
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            ⏱️
          </span>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-3xl font-extrabold text-gray-900">{upcomingTripsCount}</span>
          <span className="text-xs font-semibold text-blue-600">
            Scheduled / Ready
          </span>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          {status.trips?.scheduled ?? 0} Scheduled • {status.trips?.ready ?? 0} Ready at terminal
        </div>
      </div>

      {/* 3. Fleet Telemetry Freshness Breakdown */}
      <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            GPS Freshness
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            📡
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          {/* Live / Active <= 30s */}
          <div className="flex flex-col items-center rounded-xl bg-emerald-50 px-3 py-1.5 text-center">
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
            <span className="text-lg font-black text-emerald-800">{liveCount}</span>
            <span className="text-[10px] text-emerald-600">≤30s</span>
          </div>

          {/* Stale 31s - 120s */}
          <div className="flex flex-col items-center rounded-xl bg-amber-50 px-3 py-1.5 text-center">
            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              Stale
            </span>
            <span className="text-lg font-black text-amber-800">{staleCount}</span>
            <span className="text-[10px] text-amber-600">31-120s</span>
          </div>

          {/* Offline > 120s */}
          <div className="flex flex-col items-center rounded-xl bg-rose-50 px-3 py-1.5 text-center">
            <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
              Offline
            </span>
            <span className="text-lg font-black text-rose-800">{offlineCount}</span>
            <span className="text-[10px] text-rose-600">&gt;120s</span>
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          Evaluated across {status.telemetry?.totalActiveTrips ?? 0} active vehicle feeds
        </div>
      </div>

      {/* 4. Unresolved SOS Counter */}
      <div
        className={`flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${
          unacknowledgedSos > 0
            ? 'border-red-300 bg-red-50/70 text-red-900 shadow-red-100 ring-2 ring-red-400/50'
            : 'border-gray-200 bg-white text-gray-900'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`text-xs font-bold uppercase tracking-wider ${
              unacknowledgedSos > 0 ? 'text-red-700' : 'text-gray-500'
            }`}
          >
            Emergency SOS
          </span>
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-xl ${
              unacknowledgedSos > 0
                ? 'bg-red-200 text-red-700 animate-bounce'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            🚨
          </span>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <span
            className={`text-3xl font-extrabold ${
              unacknowledgedSos > 0 ? 'text-red-700' : 'text-gray-900'
            }`}
          >
            {unacknowledgedSos}
          </span>
          <span
            className={`text-xs font-bold ${
              unacknowledgedSos > 0 ? 'text-red-700 underline' : 'text-gray-400'
            }`}
          >
            {unacknowledgedSos > 0 ? 'ACTION REQUIRED' : 'All clear'}
          </span>
        </div>
        <div
          className={`mt-2 text-xs ${
            unacknowledgedSos > 0 ? 'font-medium text-red-600' : 'text-gray-500'
          }`}
        >
          {unacknowledgedSos > 0
            ? `${unacknowledgedSos} unacknowledged emergency alert(s) pending`
            : 'Zero pending emergency dispatches'}
        </div>
      </div>
    </div>
  );
}
