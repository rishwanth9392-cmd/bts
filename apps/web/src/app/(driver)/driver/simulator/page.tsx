'use client';

import { useState, useEffect, useRef } from 'react';
import { notFound } from 'next/navigation';
import { Button, Card, StatusBadge } from '@bts/ui';
import {
  getDriverActiveTrip,
  startTripAction,
  stopTripAction,
  sendLocationAction,
} from '@/services/telemetry.service';

// Stepped coordinates along campus transit corridor
const SIMULATED_WAYPOINTS = [
  { latitude: 13.1337, longitude: 77.5642, speed: 32, heading: 45, label: 'Origin Terminal' },
  { latitude: 13.1362, longitude: 77.5671, speed: 41, heading: 55, label: 'Hebbal Flyover Junction' },
  { latitude: 13.1395, longitude: 77.5714, speed: 45, heading: 60, label: 'Bellary Road Expressway' },
  { latitude: 13.1428, longitude: 77.5758, speed: 38, heading: 70, label: 'Yelahanka Bypass' },
  { latitude: 13.1462, longitude: 77.5799, speed: 42, heading: 75, label: 'BMSIT Campus Approach' },
  { latitude: 13.1495, longitude: 77.5835, speed: 20, heading: 85, label: 'BMSIT Main Campus Gate' },
];

export default function GpsSimulatorPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  const [trip, setTrip] = useState<any>(null);
  const [customTripId, setCustomTripId] = useState<string>('');
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastDispatched, setLastDispatched] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isAutoStreaming, setIsAutoStreaming] = useState<boolean>(false);
  const autoStreamIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadActiveTrip();
  }, []);

  const loadActiveTrip = async () => {
    setIsLoading(true);
    try {
      const activeTrip = await getDriverActiveTrip();
      if (activeTrip) {
        setTrip(activeTrip);
        setCustomTripId(activeTrip.id);
      }
    } catch (err) {
      console.error('Error fetching driver active trip:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const activeTripId = customTripId || trip?.id;

  const handleStartTrip = async () => {
    if (!activeTripId) return;
    setActionLoading('start');
    setStatusMessage(null);
    try {
      const res = await startTripAction(activeTripId);
      if (res.success) {
        setStatusMessage({ text: 'Trip started successfully! WebSocket broadcasted trip:started.', type: 'success' });
        setTrip((prev: any) => ({ ...prev, status: 'ACTIVE' }));
      } else {
        setStatusMessage({ text: res.error || 'Failed to start trip', type: 'error' });
      }
    } catch {
      setStatusMessage({ text: 'Network error starting trip', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleStopTrip = async () => {
    if (!activeTripId) return;
    setActionLoading('stop');
    setStatusMessage(null);
    setIsAutoStreaming(false);
    if (autoStreamIntervalRef.current) clearInterval(autoStreamIntervalRef.current);
    try {
      const res = await stopTripAction(activeTripId);
      if (res.success) {
        setStatusMessage({ text: 'Trip stopped! WebSocket broadcasted trip:stopped.', type: 'info' });
        setTrip((prev: any) => ({ ...prev, status: 'COMPLETED' }));
      } else {
        setStatusMessage({ text: res.error || 'Failed to stop trip', type: 'error' });
      }
    } catch {
      setStatusMessage({ text: 'Network error stopping trip', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendLocation = async (manualStep?: number) => {
    if (!activeTripId) return;
    const currentIndex = manualStep !== undefined ? manualStep : stepIndex;
    const waypoint = SIMULATED_WAYPOINTS[currentIndex % SIMULATED_WAYPOINTS.length];

    setActionLoading('send');
    try {
      const payload = {
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
        speed: waypoint.speed,
        heading: waypoint.heading,
        accuracy: 3.5,
        recordedAt: new Date().toISOString(),
      };

      const res = await sendLocationAction(activeTripId, payload);
      if (res.success) {
        setLastDispatched({ ...payload, label: waypoint.label, step: currentIndex + 1 });
        setStatusMessage({
          text: `Location sent (#${currentIndex + 1}: ${waypoint.label}) - Broadcasted trip:location!`,
          type: 'success',
        });
        setStepIndex((prev) => (prev + 1) % SIMULATED_WAYPOINTS.length);
      } else {
        setStatusMessage({ text: res.error || 'Failed to send location', type: 'error' });
      }
    } catch {
      setStatusMessage({ text: 'Network error sending location', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle Auto-Streaming every 3 seconds
  useEffect(() => {
    if (isAutoStreaming) {
      autoStreamIntervalRef.current = setInterval(() => {
        handleSendLocation();
      }, 3000);
    } else {
      if (autoStreamIntervalRef.current) {
        clearInterval(autoStreamIntervalRef.current);
        autoStreamIntervalRef.current = null;
      }
    }
    return () => {
      if (autoStreamIntervalRef.current) clearInterval(autoStreamIntervalRef.current);
    };
  }, [isAutoStreaming, activeTripId, stepIndex]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6 animate-slide-up">
      {/* Massive Development Header */}
      <div className="rounded-3xl border-4 border-red-500 bg-red-50 p-6 shadow-xl text-center">
        <span className="inline-block rounded-full bg-red-600 px-4 py-1 text-xs font-black uppercase tracking-widest text-white shadow-sm">
          Internal Test Harness Only
        </span>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-red-900 sm:text-4xl">
          DEV ONLY - GPS SIMULATOR
        </h1>
        <p className="mt-2 text-xs font-bold text-red-700 leading-relaxed max-w-lg mx-auto">
          ⚠️ This harness simulates vehicle GPS hardware broadcasts over WebSocket room channels.
          Changes directly affect student dashboards subscribed to this trip.
        </p>
      </div>

      {/* Target Trip Card */}
      <Card title="Target Trip Configuration" className="border-gray-200">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Trip Identifier (ID)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customTripId}
                onChange={(e) => setCustomTripId(e.target.value)}
                placeholder="Enter or paste Trip ID..."
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-mono focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <Button variant="secondary" size="md" onClick={loadActiveTrip} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Detect Active'}
              </Button>
            </div>
          </div>

          {trip && (
            <div className="rounded-xl bg-gray-50 p-4 border border-gray-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">{trip.route?.name || 'Route'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Bus: {trip.bus?.plateNumber || trip.busId} • Driver: {trip.driver?.licenseNumber || 'Active'}
                </p>
              </div>
              <StatusBadge status={trip.status} color={trip.status === 'ACTIVE' ? 'success' : 'warning'} />
            </div>
          )}
        </div>
      </Card>

      {/* Status Feedback Banner */}
      {statusMessage && (
        <div
          className={`rounded-2xl p-4 text-sm font-semibold shadow-sm border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : statusMessage.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Control Actions */}
      <Card title="Telemetry Stream Controls" className="border-gray-200">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Start Trip Button */}
            <Button
              variant="secondary"
              size="lg"
              disabled={!activeTripId || actionLoading === 'start'}
              onClick={handleStartTrip}
              className="font-bold border-green-500 text-green-700 hover:bg-green-50"
            >
              {actionLoading === 'start' ? 'Starting...' : '▶ Start Trip'}
            </Button>

            {/* Send Location Button */}
            <Button
              variant="primary"
              size="lg"
              disabled={!activeTripId || actionLoading === 'send'}
              onClick={() => handleSendLocation()}
              className="font-bold shadow-md"
            >
              {actionLoading === 'send' ? 'Broadcasting...' : '📡 Send Location'}
            </Button>

            {/* Stop Trip Button */}
            <Button
              variant="danger"
              size="lg"
              disabled={!activeTripId || actionLoading === 'stop'}
              onClick={handleStopTrip}
              className="font-bold"
            >
              {actionLoading === 'stop' ? 'Stopping...' : '⏹ Stop Trip'}
            </Button>
          </div>

          {/* Auto Stream Toggle */}
          <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3.5 border border-gray-200">
            <div>
              <p className="text-sm font-bold text-gray-800">Auto-Stream Coordinates</p>
              <p className="text-xs text-gray-500">Steps through simulated waypoints automatically every 3 seconds.</p>
            </div>
            <button
              onClick={() => setIsAutoStreaming(!isAutoStreaming)}
              disabled={!activeTripId}
              className={`rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider transition ${
                isAutoStreaming
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {isAutoStreaming ? 'Streaming ON' : 'Turn ON'}
            </button>
          </div>
        </div>
      </Card>

      {/* Telemetry Debug Log */}
      {lastDispatched && (
        <Card title="Last Dispatched Telemetry" className="border-gray-200">
          <div className="space-y-2 font-mono text-xs text-gray-700">
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-400">Waypoint:</span>
              <span className="font-bold text-gray-900">{lastDispatched.label}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-400">Coordinates:</span>
              <span className="font-bold text-purple-700">
                {lastDispatched.latitude.toFixed(4)}, {lastDispatched.longitude.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="text-gray-400">Speed / Heading:</span>
              <span>{lastDispatched.speed} km/h • {lastDispatched.heading}°</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Dispatched At:</span>
              <span>{new Date(lastDispatched.recordedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
