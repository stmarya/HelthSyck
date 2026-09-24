export type MapProvider = 'maplibre' | 'mapbox' | 'google' | 'simulator';

export interface MapRuntimeConfig {
  provider: MapProvider;
  styleUrl?: string;
  routingUrl?: string;
  accessToken?: string;
  staleAfterMs: number;
}

export function getMapRuntimeConfig(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>): MapRuntimeConfig {
  const configured = env.VITE_MAP_PROVIDER as MapProvider | undefined;
  const provider: MapProvider = configured === 'maplibre' || configured === 'mapbox' || configured === 'google' ? configured : 'simulator';
  return {
    provider,
    styleUrl: env.VITE_MAP_STYLE_URL,
    routingUrl: env.VITE_ROUTING_URL,
    accessToken: env.VITE_MAP_ACCESS_TOKEN,
    staleAfterMs: Number(env.VITE_LOCATION_STALE_AFTER_MS ?? 15_000),
  };
}

export function buildRoutingRequest(config: MapRuntimeConfig, origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): string | null {
  if (!config.routingUrl) return null;
  const url = new URL(config.routingUrl, window.location.origin);
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  return url.toString();
}
