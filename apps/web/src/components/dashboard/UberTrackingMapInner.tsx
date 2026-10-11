'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as LType from 'leaflet';

export interface UberTrackingMapProps {
  vehicleLat: number | null;
  vehicleLng: number | null;
  heading?: number | null;
  speed?: number | null;
  freshness: 'ACTIVE' | 'STALE' | 'OFFLINE';
  routeStops?: Array<{
    sequence: number;
    stopId?: string;
    stop: {
      id?: string;
      lat: number | null;
      lng: number | null;
      name: string;
    };
  }>;
  pickupStop?: {
    lat: number;
    lng: number;
    name: string;
  } | null;
  recenterAction?: { target: 'bus' | 'stop' | 'route'; timestamp: number } | null;
}

export function UberTrackingMapInner({
  vehicleLat,
  vehicleLng,
  heading,
  speed,
  freshness,
  routeStops = [],
  pickupStop,
  recenterAction,
}: UberTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const polylineRef = useRef<LType.Polyline | null>(null);
  const circleRef = useRef<LType.Circle | null>(null);
  const pickupMarkerRef = useRef<LType.Marker | null>(null);
  const busMarkerRef = useRef<LType.Marker | null>(null);
  const stopMarkersRef = useRef<LType.Marker[]>([]);
  const hasInitializedBounds = useRef<boolean>(false);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      // Fix default Leaflet icon paths
      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Default Center: BMSIT Bangalore
      const defaultCenter: [number, number] = [
        pickupStop?.lat ?? vehicleLat ?? 13.1332,
        pickupStop?.lng ?? vehicleLng ?? 77.5671,
      ];

      const map = L.map(containerRef.current, {
        center: defaultCenter,
        zoom: 15,
        zoomControl: false, // Clean Uber/Zomato viewport without default top-left buttons
      });

      // Carto Voyager clean vector-style tile layer
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 19,
        },
      ).addTo(map);

      // Add zoom control at bottom-right if needed, or keep clean edge-to-edge
      L.control.zoom({ position: 'topright' }).addTo(map);

      mapRef.current = map;

      // Fit bounds if coordinates available on mount
      if (vehicleLat != null && vehicleLng != null && pickupStop?.lat != null && pickupStop?.lng != null) {
        const bounds = L.latLngBounds([
          [vehicleLat, vehicleLng],
          [pickupStop.lat, pickupStop.lng],
        ]);
        map.fitBounds(bounds, { padding: [100, 100], maxZoom: 16 });
        hasInitializedBounds.current = true;
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Update Geometry: Route Polyline & Stop Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import('leaflet').then((L) => {
      // 1. Draw Route Polyline (#4F46E5, weight: 5, opacity: 0.85)
      if (routeStops && routeStops.length > 0) {
        const sorted = [...routeStops].sort((a, b) => a.sequence - b.sequence);
        const validStops = sorted.filter(
          (s): s is typeof s & { stop: { lat: number; lng: number; name: string } } =>
            s.stop.lat != null && s.stop.lng != null,
        );
        const latLngs: [number, number][] = validStops.map((s) => [s.stop.lat, s.stop.lng]);

        if (!polylineRef.current) {
          polylineRef.current = L.polyline(latLngs, {
            color: '#4F46E5',
            weight: 5,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map);
        } else {
          polylineRef.current.setLatLngs(latLngs);
        }

        // Render minor stop dots along the route
        stopMarkersRef.current.forEach((m) => m.remove());
        stopMarkersRef.current = [];

        validStops.forEach((item) => {
          // If this is the student's selected stop, we render the special pulsing radar marker instead
          const isSelected = pickupStop && Math.abs(pickupStop.lat - item.stop.lat) < 0.0001 && Math.abs(pickupStop.lng - item.stop.lng) < 0.0001;
          if (isSelected) return;

          const dotIcon = L.divIcon({
            className: 'bts-route-stop-dot',
            html: `
              <div style="width: 14px; height: 14px; border-radius: 9999px; background: #FFFFFF; border: 3px solid #4F46E5; box-shadow: 0 2px 6px rgba(0,0,0,0.25);"></div>
            `,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });

          const stopMarker = L.marker([item.stop.lat, item.stop.lng], { icon: dotIcon }).addTo(map);
          stopMarker.bindPopup(`<b>${item.stop.name}</b><br/><span style="font-size: 11px; color: #64748B;">Stop #${item.sequence}</span>`);
          stopMarkersRef.current.push(stopMarker);
        });

        // Initial bounds fit to polyline if no bus coordinates yet
        if (!hasInitializedBounds.current && latLngs.length > 0 && vehicleLat == null) {
          map.fitBounds(L.latLngBounds(latLngs), { padding: [80, 80], maxZoom: 15 });
          hasInitializedBounds.current = true;
        }
      } else if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }
    });
  }, [routeStops, pickupStop, vehicleLat]);

  // Update 50m Geofence Circle & Pulsing Radar Marker on Pickup Stop
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import('leaflet').then((L) => {
      if (pickupStop && pickupStop.lat != null && pickupStop.lng != null) {
        // Outer 50m circular geofence boundary
        if (!circleRef.current) {
          circleRef.current = L.circle([pickupStop.lat, pickupStop.lng], {
            radius: 50,
            color: '#4F46E5',
            fillColor: '#6366F1',
            fillOpacity: 0.16,
            weight: 2,
            dashArray: '5, 5',
          }).addTo(map);
        } else {
          circleRef.current.setLatLng([pickupStop.lat, pickupStop.lng]);
        }

        // Center Pulsing Radar CSS Icon
        const radarDivIcon = L.divIcon({
          className: 'bts-pickup-radar-marker',
          html: `
            <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
              <span class="animate-ping" style="position: absolute; width: 50px; height: 50px; border-radius: 9999px; background: #818CF8; opacity: 0.45;"></span>
              <span class="animate-pulse" style="position: absolute; width: 68px; height: 68px; border-radius: 9999px; background: #6366F1; opacity: 0.2;"></span>
              <div style="position: relative; width: 36px; height: 36px; border-radius: 9999px; background: #4F46E5; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.45); display: flex; align-items: center; justify-content: center; font-size: 16px; color: white;">
                🚏
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        if (!pickupMarkerRef.current) {
          pickupMarkerRef.current = L.marker([pickupStop.lat, pickupStop.lng], {
            icon: radarDivIcon,
          }).addTo(map);
          pickupMarkerRef.current.bindPopup(
            `<b>📍 Your Pickup Stop</b><br/><b>${pickupStop.name}</b><br/><span style="font-size: 11px; color: #4F46E5;">50m Geofence Active</span>`,
          );
        } else {
          pickupMarkerRef.current.setLatLng([pickupStop.lat, pickupStop.lng]);
          pickupMarkerRef.current.setIcon(radarDivIcon);
        }
      } else {
        if (circleRef.current) {
          circleRef.current.remove();
          circleRef.current = null;
        }
        if (pickupMarkerRef.current) {
          pickupMarkerRef.current.remove();
          pickupMarkerRef.current = null;
        }
      }
    });
  }, [pickupStop]);

  // Update Moving Bus Marker with Directional SVG and CSS Glide Smoothing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import('leaflet').then((L) => {
      if (vehicleLat != null && vehicleLng != null) {
        const rotationDeg = heading ?? 0;
        const busIcon = L.divIcon({
          className: 'bts-animated-bus-icon',
          html: `
            <div style="position: relative; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; transition: transform 1s ease;">
              <!-- Direction Heading Indicator Arrow -->
              <div style="position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center; transform: rotate(${rotationDeg}deg); transform-origin: center center; transition: transform 1s ease;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#4338CA" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45)); margin-top: -8px;">
                  <polygon points="12,2 4,14 10,14 10,22 14,22 14,14 20,14" />
                </svg>
              </div>
              <!-- Transit Vehicle Badge -->
              <div style="position: relative; width: 42px; height: 42px; border-radius: 9999px; background: #FBBF24; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 14px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E293B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="15" rx="3" fill="#FBBF24"/>
                  <path d="M3 10h18" stroke="#78350F" stroke-width="1.5"/>
                  <circle cx="7" cy="18" r="2" fill="#1E293B"/>
                  <circle cx="17" cy="18" r="2" fill="#1E293B"/>
                  <path d="M7 6h3M14 6h3" stroke="#78350F" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </div>
            </div>
          `,
          iconSize: [50, 50],
          iconAnchor: [25, 25],
        });

        if (!busMarkerRef.current) {
          busMarkerRef.current = L.marker([vehicleLat, vehicleLng], {
            icon: busIcon,
          }).addTo(map);
          busMarkerRef.current.bindPopup(
            `<b>🚌 Transit Vehicle</b><br/>Speed: ${speed ? Math.round(speed) + ' km/h' : '0 km/h'}<br/>Status: ${freshness}`,
          );
        } else {
          busMarkerRef.current.setLatLng([vehicleLat, vehicleLng]);
          busMarkerRef.current.setIcon(busIcon);
        }

        // Fit bounds once on first coordinate arrival if not yet initialized
        if (!hasInitializedBounds.current) {
          if (pickupStop?.lat != null && pickupStop?.lng != null) {
            map.fitBounds(
              L.latLngBounds([
                [vehicleLat, vehicleLng],
                [pickupStop.lat, pickupStop.lng],
              ]),
              { padding: [100, 100], maxZoom: 16 },
            );
          } else {
            map.panTo([vehicleLat, vehicleLng], { animate: true, duration: 1 });
          }
          hasInitializedBounds.current = true;
        }
      } else if (busMarkerRef.current) {
        busMarkerRef.current.remove();
        busMarkerRef.current = null;
      }
    });
  }, [vehicleLat, vehicleLng, heading, speed, freshness, pickupStop]);

  // Handle Declarative Recenter Actions
  useEffect(() => {
    if (!recenterAction || !mapRef.current) return;
    const map = mapRef.current;

    if (recenterAction.target === 'bus' && vehicleLat != null && vehicleLng != null) {
      map.flyTo([vehicleLat, vehicleLng], 16, { duration: 0.8 });
    } else if (recenterAction.target === 'stop' && pickupStop?.lat != null && pickupStop?.lng != null) {
      map.flyTo([pickupStop.lat, pickupStop.lng], 16, { duration: 0.8 });
    } else if (recenterAction.target === 'route' && routeStops.length > 0) {
      import('leaflet').then((L) => {
        const valid = routeStops.filter(
          (s): s is typeof s & { stop: { lat: number; lng: number; name: string } } =>
            s.stop.lat != null && s.stop.lng != null,
        );
        if (valid.length > 0) {
          const latLngs: [number, number][] = valid.map((s) => [s.stop.lat, s.stop.lng]);
          map.fitBounds(L.latLngBounds(latLngs), { padding: [80, 80], maxZoom: 16 });
        }
      });
    }
  }, [recenterAction, vehicleLat, vehicleLng, pickupStop, routeStops]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        polylineRef.current = null;
        circleRef.current = null;
        pickupMarkerRef.current = null;
        busMarkerRef.current = null;
        stopMarkersRef.current = [];
      }
    };
  }, []);

  return (
    <>
      <style jsx global>{`
        .bts-animated-bus-icon {
          transition: transform 1s ease, top 1s linear, left 1s linear !important;
        }
        .leaflet-marker-pane .bts-animated-bus-icon {
          transition: transform 1s ease, top 1s linear, left 1s linear !important;
        }
      `}</style>
      <div ref={containerRef} className="h-full w-full absolute inset-0 z-0 bg-slate-900" />
    </>
  );
}
