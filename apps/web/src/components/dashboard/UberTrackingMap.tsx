'use client';

import dynamic from 'next/dynamic';
import type { UberTrackingMapProps } from './UberTrackingMapInner';

export type { UberTrackingMapProps };

const DynamicUberTrackingMap = dynamic<UberTrackingMapProps>(
  () => import('./UberTrackingMapInner').then((mod) => mod.UberTrackingMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center bg-slate-950 text-white z-0">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Initializing Live Transit Map...
          </p>
        </div>
      </div>
    ),
  },
);

export function UberTrackingMap(props: UberTrackingMapProps) {
  return <DynamicUberTrackingMap {...props} />;
}
