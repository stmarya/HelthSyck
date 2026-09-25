export type MapProvider = 'maplibre' | 'mapbox' | 'google' | 'simulator';

export interface MapRuntimeConfig {
  provider: MapProvider;
  styleUrl?: string;
  routingUrl?: string;
  accessToken?: string;
  staleAfterMs: number;
}

export interface MapReadiness {
  status: 'live' | 'simulator' | 'blocked';
  detail: string;
  issues: string[];
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getMapRuntimeConfig(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>): MapRuntimeConfig {
  const configured = env.VITE_MAP_PROVIDER as MapProvider | undefined;
  const provider: MapProvider = configured === 'maplibre' || configured === 'mapbox' || configured === 'google' ? configured : 'simulator';
  return {
    provider,
    styleUrl: env.VITE_MAP_STYLE_URL,
    routingUrl: env.VITE_ROUTING_URL,
    accessToken: env.VITE_MAP_ACCESS_TOKEN,
    staleAfterMs: positiveNumber(env.VITE_LOCATION_STALE_AFTER_MS, 15_000),
  };
}

export function getMapReadiness(config: MapRuntimeConfig): MapReadiness {
  if (config.provider === 'simulator') {
    return {
      status: 'simulator',
      detail: 'Simulator aktif; live GPS belum dikonfigurasi untuk production.',
      issues: ['VITE_MAP_PROVIDER belum diset ke provider live'],
    };
  }

  const issues: string[] = [];
  if (!config.routingUrl) issues.push('VITE_ROUTING_URL belum dikonfigurasi');
  if ((config.provider === 'maplibre' || config.provider === 'mapbox') && !config.styleUrl) issues.push('VITE_MAP_STYLE_URL belum dikonfigurasi');
  if ((config.provider === 'mapbox' || config.provider === 'google') && !config.accessToken) issues.push('VITE_MAP_ACCESS_TOKEN belum dikonfigurasi');

  return issues.length > 0
    ? { status: 'blocked', detail: `Konfigurasi map belum lengkap: ${issues.join('; ')}`, issues }
    : { status: 'live', detail: `${config.provider} + routing siap digunakan.`, issues: [] };
}

export function buildRoutingRequest(config: MapRuntimeConfig, origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): string | null {
  if (!config.routingUrl) return null;
  try {
    const url = new URL(config.routingUrl, window.location.origin);
    url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
    return url.toString();
  } catch {
    return null;
  }
}
