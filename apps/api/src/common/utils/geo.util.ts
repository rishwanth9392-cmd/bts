/**
 * Geographic calculation utilities using Haversine formula.
 */

/** Earth's mean radius in meters */
const EARTH_RADIUS_METERS = 6371000;

/** Default geofence radius for pickup stop arrival detection */
export const GEOFENCE_RADIUS_METERS = 150;

/** Hysteresis buffer in meters to prevent boundary jitter */
export const GEOFENCE_EXIT_BUFFER_METERS = 50;

/** Threshold distance in meters for transitioning from ENTERED back to OUTSIDE */
export const GEOFENCE_EXIT_THRESHOLD_METERS = GEOFENCE_RADIUS_METERS + GEOFENCE_EXIT_BUFFER_METERS; // 200 meters

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lon1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lon2 Longitude of point 2 in decimal degrees
 * @returns Distance in meters
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}
