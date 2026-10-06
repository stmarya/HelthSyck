import type { RealtimeClient } from './client';

type Stop = () => void;

/**
 * Device location strategy:
 * - navigator.geolocation.watchPosition for foreground/browser/PWA clients;
 * - high accuracy, distanceFilter 10m, and maximumAge 5s;
 * - server receives accuracy, heading and speed for stale/quality indicators;
 * - application must stop the watcher on logout/task completion.
 */
export function startDeviceLocationTracking(client: RealtimeClient, entityId: string, entityType: 'AMBULANCE' | 'DRIVER'): Stop {
  if (!('geolocation' in navigator)) throw new Error('Geolocation tidak tersedia pada perangkat ini');
  const watchId = navigator.geolocation.watchPosition(
    (position) => client.sendLocation({
      entityId,
      entityType,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyM: position.coords.accuracy,
      heading: position.coords.heading ?? undefined,
      speedKmh: position.coords.speed == null ? undefined : position.coords.speed * 3.6,
    }),
    (error) => console.warn('[location] watch error', error.code, error.message),
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
  );
  return () => navigator.geolocation.clearWatch(watchId);
}
