'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as LType from 'leaflet';

export interface LiveMapProps {
  latitude: number | null;
  longitude: number | null;
  heading?: number | null;
  speed?: number | null;
  freshness: 'ACTIVE' | 'STALE' | 'OFFLINE';
  tripName?: string;
  className?: string;
  pickupLocation?: {
    latitude: number | null;
    longitude: number | null;
    name?: string | null;
  } | null;
}

export function LiveMapInner({
  latitude,
  longitude,
  heading,
  speed,
  freshness,
  tripName = 'Campus Transit',
  className = 'h-80',
  pickupLocation,
}: LiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LType.Map | null>(null);
  const busMarkerRef = useRef<LType.Marker | null>(null);
  const pickupMarkerRef = useRef<LType.Marker | null>(null);

  // Status Badge configurations
  const badgeConfig = {
    ACTIVE: {
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      dot: 'bg-emerald-500 animate-ping',
      label: 'ACTIVE • LIVE GPS',
    },
    STALE: {
      bg: 'bg-amber-50 border-amber-200 text-amber-800',
      dot: 'bg-amber-500',
      label: 'STALE • SIGNAL DELAYED',
    },
    OFFLINE: {
      bg: 'bg-gray-100 border-gray-300 text-gray-700',
      dot: 'bg-gray-400',
      label: 'OFFLINE • NO GPS SIGNAL',
    },
  }[freshness];

  useEffect(() => {
    // If no coordinates, strictly avoid initializing Leaflet
    if (latitude === null || longitude === null || !mapContainerRef.current) {
      return;
    }

    let isMounted = true;

    // Dynamically import Leaflet in browser
    import('leaflet').then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      // Fix default Leaflet icon paths
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Initialize map instance if not already created
      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [latitude, longitude],
          zoom: 15,
          zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      // 1. Create / update moving Bus marker
      const rotationDeg = heading ?? 0;
      const busDivIcon = L.divIcon({
        className: 'custom-bus-div-icon',
        html: `
          <div style="transform: rotate(${rotationDeg}deg); transition: transform 0.3s ease-out;" class="flex items-center justify-center w-11 h-11 rounded-full bg-primary-yellow border-2 border-white shadow-xl text-xl select-none">
            🚌
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      if (!busMarkerRef.current) {
        const marker = L.marker([latitude, longitude], { icon: busDivIcon }).addTo(map);
        marker.bindPopup(`<b>${tripName}</b><br/>Speed: ${speed ? Math.round(speed) + ' km/h' : 'N/A'}`);
        busMarkerRef.current = marker;
      } else {
        busMarkerRef.current.setLatLng([latitude, longitude]);
        busMarkerRef.current.setIcon(busDivIcon);
      }

      // 2. Distinct 📍 Your Pickup marker using assigned student stop coordinates
      const hasPickupCoords =
        pickupLocation &&
        pickupLocation.latitude !== null &&
        pickupLocation.latitude !== undefined &&
        pickupLocation.longitude !== null &&
        pickupLocation.longitude !== undefined;

      if (hasPickupCoords) {
        const pickupDivIcon = L.divIcon({
          className: 'custom-pickup-div-icon',
          html: `
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-purple-600 border-2 border-white shadow-xl text-base select-none text-white">
              📍
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        if (!pickupMarkerRef.current) {
          const pMarker = L.marker(
            [pickupLocation.latitude!, pickupLocation.longitude!],
            { icon: pickupDivIcon },
          ).addTo(map);
          pMarker.bindPopup(`<b>📍 Your Pickup</b><br/>${pickupLocation.name || 'Designated Stop'}`);
          pickupMarkerRef.current = pMarker;
        } else {
          pickupMarkerRef.current.setLatLng([
            pickupLocation.latitude!,
            pickupLocation.longitude!,
          ]);
          pickupMarkerRef.current.setIcon(pickupDivIcon);
        }

        // Fit map bounds to view both the moving bus and student pickup stop
        const bounds = L.latLngBounds([
          [latitude, longitude],
          [pickupLocation.latitude!, pickupLocation.longitude!],
        ]);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } else {
        // Remove pickup marker if no longer applicable
        if (pickupMarkerRef.current) {
          pickupMarkerRef.current.remove();
          pickupMarkerRef.current = null;
        }
        map.panTo([latitude, longitude], { animate: true, duration: 0.5 });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [latitude, longitude, heading, speed, tripName, pickupLocation]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        busMarkerRef.current = null;
        pickupMarkerRef.current = null;
      }
    };
  }, []);

  // Strict empty state if valid coordinates are missing — no fabricated markers
  if (latitude === null || longitude === null) {
    return (
      <div className="flex min-h-[260px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
        <div className="mb-2 text-2xl">🗺️</div>
        <p className="text-sm font-semibold text-gray-700">Map route data unavailable</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-gray-200 shadow-sm ${className}`}>
      {/* Map Leaflet Container */}
      <div ref={mapContainerRef} className="h-full w-full z-0" />

      {/* Status Overlay Badge */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black shadow-md border backdrop-blur-md ${badgeConfig.bg}`}>
          <span className="relative flex h-2 w-2">
            {freshness === 'ACTIVE' && (
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${badgeConfig.dot}`} />
            )}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${freshness === 'ACTIVE' ? 'bg-emerald-600' : freshness === 'STALE' ? 'bg-amber-600' : 'bg-gray-500'}`} />
          </span>
          <span>{badgeConfig.label}</span>
        </div>
      </div>

      {/* Speed & Heading Info Card (Bottom-Left) */}
      <div className="absolute bottom-3 left-3 z-[1000] rounded-xl bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-md border border-gray-200 backdrop-blur-md flex items-center gap-3">
        <span>🚌 {tripName}</span>
        {speed !== null && speed !== undefined && (
          <span className="border-l border-gray-200 pl-3 text-purple-700 font-bold">
            {Math.round(speed)} km/h
          </span>
        )}
      </div>
    </div>
  );
}
