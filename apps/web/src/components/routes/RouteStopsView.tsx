'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RouteDetail, RouteStopDetail } from '@bts/shared';
import { Button } from '@bts/ui';
import { setMyPickup } from '@/services/student.service';

interface RouteStopsViewProps {
  route: RouteDetail;
}

export function RouteStopsView({ route }: RouteStopsViewProps) {
  const router = useRouter();

  // Selected stop pending confirmation
  const [selectedStop, setSelectedStop] = useState<RouteStopDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // CRUCIAL: Strictly preserve array order returned by API (sorted by sequence).
  // Do NOT sort alphabetically.
  const stops = route.routeStops || [];

  const handleConfirmPickup = async () => {
    if (!selectedStop) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await setMyPickup(route.id, selectedStop.stopId);

      if (res.success) {
        // Successful response -> redirect to student dashboard
        router.push('/student/dashboard');
        router.refresh();
      } else {
        // API error (e.g. 400 Bad Request) -> display graceful message
        setErrorMessage(res.error || 'Failed to set pickup stop. Please try again.');
        setIsSubmitting(false);
      }
    } catch (_err) {
      setErrorMessage('A network error occurred. Please check your connection.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 animate-slide-up">
      {/* Back Navigation & Route Header */}
      <div>
        <Link
          href="/student/routes"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-700 hover:text-purple-900 transition mb-3"
        >
          <span>&larr;</span> All Routes
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-200 pb-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900">{route.name}</h2>
            <p className="text-xs font-semibold text-purple-700 mt-1">
              {stops.length} Sequenced Stops • BMSIT Campus Transit
            </p>
          </div>
          <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700 border border-green-200 self-start sm:self-center">
            Active Schedule
          </span>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start justify-between gap-3 shadow-sm animate-shake">
          <div className="flex items-start gap-2.5">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-bold">Unable to set pickup</p>
              <p className="text-xs text-red-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs font-bold text-red-600 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Sequenced Stops List */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Stop Sequence & Timetable</h3>
          <span className="text-xs text-gray-400">Ordered by arrival</span>
        </div>

        {stops.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No stops registered for this route.
          </p>
        ) : (
          <div className="relative space-y-0">
            {/* Visual connecting timeline track */}
            <div
              className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-gray-200 pointer-events-none"
              aria-hidden="true"
            />

            {stops.map((rs, index) => {
              const stopName = rs.stop?.name || 'Unnamed Stop';
              const scheduledTime = rs.scheduledTime || 'Time N/A';
              const isFirst = index === 0;
              const isLast = index === stops.length - 1;

              return (
                <div
                  key={rs.id || `${rs.routeId}-${rs.sequence}`}
                  className="relative flex items-center justify-between gap-4 py-3.5 hover:bg-gray-50/80 rounded-xl px-2 transition"
                >
                  {/* Left: Sequence badge + Stop Name */}
                  <div className="flex items-center gap-3.5 min-w-0 z-10">
                    <div
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-extrabold shadow-sm border ${
                        isFirst
                          ? 'bg-purple-600 text-white border-purple-700 ring-2 ring-purple-100'
                          : isLast
                          ? 'bg-primary-yellow text-black border-yellow-500 ring-2 ring-yellow-100'
                          : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >
                      {rs.sequence}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {stopName}
                        </p>
                        {isFirst && (
                          <span className="text-[10px] uppercase font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                            Origin
                          </span>
                        )}
                        {isLast && (
                          <span className="text-[10px] uppercase font-bold text-yellow-800 bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-200">
                            Campus
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-purple-600 sm:hidden mt-0.5">
                        ⏱️ {scheduledTime}
                      </p>
                    </div>
                  </div>

                  {/* Right: Scheduled Time + Selection Button */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="hidden sm:inline-block text-sm font-extrabold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-md">
                      {scheduledTime}
                    </span>

                    {/* Select Button */}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setErrorMessage(null);
                        setSelectedStop(rs);
                      }}
                      className="touch-manipulation border border-gray-300 font-semibold hover:border-purple-400 hover:text-purple-700"
                    >
                      Select
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {selectedStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-scale-up border border-gray-100">
            <div className="flex items-center gap-3 text-purple-700">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-xl">
                📍
              </span>
              <div>
                <h4 className="text-lg font-bold text-gray-900">Confirm Pickup Stop</h4>
                <p className="text-xs text-gray-500">{route.name}</p>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 border border-gray-200 space-y-2">
              <p className="text-sm text-gray-700">
                Set <span className="font-extrabold text-gray-900">{selectedStop.stop?.name}</span> as your pickup for{' '}
                <span className="font-extrabold text-primary-yellow bg-gray-900 px-1.5 py-0.5 rounded text-xs">
                  {selectedStop.scheduledTime || 'morning pickup'}
                </span>
                ?
              </p>
              <p className="text-xs text-gray-500">
                Stop sequence #{selectedStop.sequence} along the route.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="md"
                disabled={isSubmitting}
                onClick={() => {
                  if (!isSubmitting) setSelectedStop(null);
                }}
              >
                Cancel
              </Button>

              <Button
                variant="primary"
                size="md"
                disabled={isSubmitting}
                onClick={handleConfirmPickup}
                className="min-w-[110px]"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin text-black"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>Saving...</span>
                  </span>
                ) : (
                  'Confirm & Pin'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
