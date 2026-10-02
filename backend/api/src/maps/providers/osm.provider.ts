import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  DistanceResult,
  GeocodeResult,
  MapsProvider,
  ReverseGeocodeResult,
  RouteResult,
} from './maps-provider.interface';
import { MockMapsProvider } from './mock.provider';

/**
 * Nominatim (OpenStreetMap) provider.
 * Free, no API key required.
 * Subject to OSM usage policy: max 1 request/second, must set a User-Agent.
 */
@Injectable()
export class OsmMapsProvider implements MapsProvider {
  readonly name = 'osm';
  private readonly logger = new Logger(OsmMapsProvider.name);
  private readonly baseUrl: string;
  private readonly fallback = new MockMapsProvider();
  private readonly geocodeCache = new Map<string, { value: GeocodeResult; expiresAt: number }>();
  private readonly reverseGeocodeCache = new Map<string, { value: ReverseGeocodeResult; expiresAt: number }>();

  constructor() {
    this.baseUrl =
      (process.env.MAPS_BASE_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
  }

  async geocode(address: string): Promise<GeocodeResult> {
    const cacheKey = address.trim().toLocaleLowerCase();
    const cached = this.getCached(this.geocodeCache, cacheKey);
    if (cached) return cached;
    try {
      const url = `${this.baseUrl}/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=0`;
      const data = await this.fetchJson<any[]>(url);
      if (!data || data.length === 0) {
        this.logger.warn('OSM geocode returned no results; using development fallback');
        return this.cache(this.geocodeCache, cacheKey, await this.fallback.geocode(address));
      }
      const item = data[0];
      return this.cache(this.geocodeCache, cacheKey, {
        address: item.display_name ?? address,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        provider: this.name,
      });
    } catch (e) {
      // Provider errors may contain a request URL (and therefore address data).
      this.logger.warn('OSM geocode unavailable; using development fallback');
      return this.cache(this.geocodeCache, cacheKey, await this.fallback.geocode(address));
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
    const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    const cached = this.getCached(this.reverseGeocodeCache, cacheKey);
    if (cached) return cached;
    try {
      const url = `${this.baseUrl}/reverse?lat=${latitude}&lon=${longitude}&format=json`;
      const data = await this.fetchJson<any>(url);
      if (!data?.display_name) {
        return this.cache(this.reverseGeocodeCache, cacheKey, await this.fallback.reverseGeocode(latitude, longitude));
      }
      return this.cache(this.reverseGeocodeCache, cacheKey, {
        latitude,
        longitude,
        address: data.display_name as string,
        provider: this.name,
      });
    } catch (e) {
      this.logger.warn('OSM reverse geocode unavailable; using development fallback');
      return this.cache(this.reverseGeocodeCache, cacheKey, await this.fallback.reverseGeocode(latitude, longitude));
    }
  }

  async calculateDistance(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<DistanceResult> {
    // OSM Nominatim doesn't offer routing — delegate to mock (Haversine)
    return this.fallback.calculateDistance(originLat, originLon, destLat, destLon);
  }

  async calculateRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteResult> {
    // OSM Nominatim doesn't offer routing — delegate to mock (Haversine estimate)
    const route = await this.fallback.calculateRoute(originLat, originLon, destLat, destLon);
    return { ...route, provider: 'osm-estimate (Haversine, not real routing)' };
  }

  async calculateETA(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteResult> {
    return this.calculateRoute(originLat, originLon, destLat, destLon);
  }

  private getCached<T>(cache: Map<string, { value: T; expiresAt: number }>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private cache<T>(cache: Map<string, { value: T; expiresAt: number }>, key: string, value: T): T {
    // Short-lived in-process cache prevents duplicate UI refreshes from hitting Nominatim.
    cache.set(key, { value, expiresAt: Date.now() + 5 * 60_000 });
    return value;
  }

  private fetchJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? require('https') : require('http');
      const headers: Record<string, string> = {
        'User-Agent': 'PMT-Platform/1.0 (github.com/pmt)',
        'Accept': 'application/json',
      };
      const req = lib.get(url, { headers }, (res: any) => {
        if (res.statusCode !== 200) {
          reject(new Error(`OSM HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        let raw = '';
        res.on('data', (c: any) => (raw += c));
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch (e) { reject(e); }
        });
      });
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('OSM request timeout')); });
      req.on('error', reject);
    });
  }
}

/**
 * Factory: select the correct provider based on MAPS_PROVIDER env variable.
 */
export function createMapsProvider(): MapsProvider {
  const providerName = (process.env.MAPS_PROVIDER || 'mock').toLowerCase();
  if (providerName === 'osm') return new OsmMapsProvider();
  // Google and Mapbox adapters can be introduced without changing MapsService.
  // Missing configuration deliberately falls back to a non-networked provider.
  return new MockMapsProvider();
}
