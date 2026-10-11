'use client';

import Link from 'next/link';
import { Button } from '@bts/ui';

export default function BoardingPage() {
  return (
    <div className="flex min-h-[75vh] flex-col items-center justify-center p-6 space-y-8 bg-gray-50 text-center animate-slide-up max-w-md mx-auto">
      <div className="rounded-full bg-primary-yellow/20 p-6 text-4xl shadow-sm">
        🎟️
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-black text-gray-900">App Boarding</h2>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">
          Boarding is fully automated. When your bus enters your pickup geofence, a prompt will appear on your dashboard to confirm boarding.
        </p>
      </div>

      <div className="w-full space-y-3 pt-2">
        <Link href="/student/dashboard" className="block w-full">
          <Button
            variant="primary"
            size="lg"
            className="w-full min-h-[48px] text-base font-bold shadow-md touch-manipulation"
          >
            Go to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
