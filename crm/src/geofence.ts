/** Geofence math for the member apps. Coordinates are checked and discarded. */

const EARTH_M = 6371000;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function insideGeofence(input: {
  latitude: number;
  longitude: number;
  schoolLatitude: number;
  schoolLongitude: number;
  radiusM: number;
}) {
  const distanceM = distanceMeters(
    { latitude: input.latitude, longitude: input.longitude },
    { latitude: input.schoolLatitude, longitude: input.schoolLongitude },
  );
  return { inside: distanceM <= input.radiusM, distanceM };
}

/**
 * A class is inside the window when now is between
 * start − beforeMin and start + afterMin.
 */
export function sessionInCheckinWindow(input: {
  nowMs: number;
  startsAtMs: number;
  beforeMin: number;
  afterMin: number;
}) {
  const open = input.startsAtMs - input.beforeMin * 60_000;
  const close = input.startsAtMs + input.afterMin * 60_000;
  return input.nowMs >= open && input.nowMs <= close;
}
