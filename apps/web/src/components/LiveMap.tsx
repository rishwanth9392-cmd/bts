'use client';

import dynamic from 'next/dynamic';
import type { LiveMapProps } from './LiveMapInner';
export type { LiveMapProps };

// Dynamic import with ssr: false ensures Leaflet is never invoked during Next.js SSR
const DynamicLiveMap = dynamic<LiveMapProps>(
  () => import('./LiveMapInner').then((mod) => mod.LiveMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[260px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center animate-pulse">
        <div className="mb-2 text-2xl">🗺️</div>
        <p className="text-xs font-semibold text-gray-500">Initializing Live Map Engine...</p>
      </div>
    ),
  },
);

export function LiveMap(props: LiveMapProps) {
  return <DynamicLiveMap {...props} />;
}
