'use client';

import React, { useState } from 'react';
import type { AdminTripItem } from '@/hooks/useAdminFleet';
import { Button } from '@bts/ui';

interface TripCancellationModalProps {
  trip: AdminTripItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tripId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
}

export function TripCancellationModal({
  trip,
  isOpen,
  onClose,
  onConfirm,
}: TripCancellationModalProps) {
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !trip) return null;

  const isActiveTrip = trip.status === 'ACTIVE';

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await onConfirm(trip.id, reason.trim());
      if (res.success) {
        setReason('');
        onClose();
      } else {
        setErrorMessage(res.error || 'Failed to cancel trip.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error cancelling trip.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-2xl">
              🛑
            </span>
            <div>
              <h3 id="modal-title" className="text-xl font-black text-gray-900">
                {isActiveTrip ? 'Emergency Abort Active Trip' : 'Confirm Trip Cancellation'}
              </h3>
              <p className="text-xs text-gray-500">
                Trip ID: <span className="font-mono">{trip.id}</span>
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

        {/* Warning Body */}
        <div className="mt-5 space-y-4 text-sm text-gray-600">
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-rose-900">
            <p className="font-bold">
              {isActiveTrip
                ? '⚠️ CAUTION: This trip is currently ACTIVE and transmitting telemetry!'
                : 'Are you sure you want to cancel this scheduled trip?'}
            </p>
            <p className="mt-1 text-xs text-rose-800">
              {isActiveTrip
                ? 'Aborting this trip will immediately terminate tracking broadcasts, reset geofence caches, notify all subscribed students, and audit this action.'
                : 'Cancelling will remove this assignment from the driver dispatch roster.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 p-3.5 rounded-xl border border-gray-100">
            <div>
              <span className="text-gray-400 font-medium">Route:</span>
              <p className="font-bold text-gray-800">{trip.route?.name || 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-400 font-medium">Vehicle:</span>
              <p className="font-bold text-gray-800">{trip.bus?.plateNumber || 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-400 font-medium">Driver:</span>
              <p className="font-bold text-gray-800">
                {trip.driver?.name || trip.driver?.licenseNumber || 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-gray-400 font-medium">Current Status:</span>
              <p className="font-bold text-rose-600">{trip.status}</p>
            </div>
          </div>

          {/* Cancellation Reason Input */}
          <div className="space-y-1.5">
            <label htmlFor="cancel-reason" className="block text-xs font-bold text-gray-700">
              Reason for Cancellation <span className="font-normal text-gray-400">(Required for audit log)</span>
            </label>
            <textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Mechanical fault, severe traffic blockage, driver replacement needed..."
              className="w-full rounded-xl border border-gray-300 p-3 text-xs text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              disabled={isSubmitting}
            />
          </div>

          {errorMessage && (
            <div className="rounded-xl bg-red-100 p-3 text-xs font-bold text-red-700">
              ❌ {errorMessage}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end space-x-3">
          <Button
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-gray-300 font-bold text-gray-700"
          >
            Go Back
          </Button>

          <Button
            variant="danger"
            size="md"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="rounded-xl bg-rose-600 font-bold text-white hover:bg-rose-700 shadow-md"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Cancelling...
              </span>
            ) : isActiveTrip ? (
              'Confirm Emergency Abort'
            ) : (
              'Confirm Cancellation'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
