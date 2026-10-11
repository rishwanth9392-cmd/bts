'use client';

import { Suspense, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getRoutes } from '@/services/student.service';
import type { RouteDetail } from '@bts/shared';
import { Card, Skeleton, Button } from '@bts/ui';

function StudentRoutesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [routes, setRoutes] = useState<RouteDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Load routes on mount or query change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(() => {
      startTransition(async () => {
        const data = await getRoutes(query);
        if (!cancelled) {
          setRoutes(data);
          setLoading(false);
        }
      });
    }, query ? 250 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 animate-slide-up">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-gray-900">Campus Bus Routes</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Select your daily commute route to view stops and pin your pickup location.
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
          <svg
            className="h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="search"
          role="combobox"
          aria-expanded={routes.length > 0}
          aria-label="Filter campus bus routes"
          aria-controls="routes-list"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by route name, number, or stop (e.g. KR Puram, 02)..."
          className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 pl-11 pr-10 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 shadow-sm transition"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs font-semibold text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Route List */}
      <div id="routes-list" role="listbox" className="space-y-3">
        {loading || isPending ? (
          /* Skeletons */
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-3"
              >
                <div className="flex justify-between items-center">
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : routes.length === 0 ? (
          /* Empty Search Result */
          <Card title="No Routes Found">
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <span className="text-3xl mb-2">🔍</span>
              <p className="text-sm font-medium text-gray-600">
                No routes found matching &ldquo;{query}&rdquo;.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Try searching by route number (e.g. &ldquo;2&rdquo;), or area (e.g. &ldquo;Hebbal&rdquo;).
              </p>
              {query && (
                <div className="mt-4">
                  <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
                    Reset Search
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ) : (
          /* Routes Collection */
          routes.map((route) => {
            const stopCount = route.routeStops?.length ?? 0;
            const firstStop = route.routeStops?.[0]?.stop?.name;
            const lastStop = route.routeStops?.[stopCount - 1]?.stop?.name;

            return (
              <div
                key={route.id}
                onClick={() => router.push(`/student/routes/${route.id}`)}
                className="group relative cursor-pointer rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-purple-300 hover:shadow-md active:scale-[0.99] touch-manipulation"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-gray-900 group-hover:text-purple-700 transition">
                        {route.name}
                      </h3>
                      <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">
                        {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
                      </span>
                    </div>

                    {firstStop && lastStop && (
                      <p className="text-xs text-gray-500 truncate flex items-center gap-1.5 pt-0.5">
                        <span className="font-medium text-gray-700">{firstStop}</span>
                        <span>&rarr;</span>
                        <span className="font-medium text-gray-700">{lastStop}</span>
                      </p>
                    )}
                  </div>

                  {/* Navigation Arrow */}
                  <div className="flex-shrink-0 text-gray-400 group-hover:text-purple-600 transition pl-2">
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function StudentRoutesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      }
    >
      <StudentRoutesContent />
    </Suspense>
  );
}
