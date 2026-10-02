import {
  DistanceResult,
  GeocodeResult,
  MapsProvider,
  ReverseGeocodeResult,
  RouteResult,
} from './maps-provider.interface';

/**
 * Mock / development provider.
 * Uses the Haversine formula for distance.
 * Does NOT call any external service.
 * Clearly marks all results as mock estimates.
 */
export class MockMapsProvider implements MapsProvider {
  readonly name = 'mock';

  // Approximate average urban driving speed (km/h)
  private readonly avgSpeedKmh = 30;

  async geocode(address: string): Promise<GeocodeResult> {
    // Return a deterministic centroid for India as a safe development default
    const lat = 20.5937 + this.pseudoHash(address) * 5;
    const lon = 78.9629 + this.pseudoHash(address.split('').reverse().join('')) * 5;
    return {
      address: address.trim(),
      latitude: parseFloat(lat.toFixed(6)),
      longitude: parseFloat(lon.toFixed(6)),
      provider: this.name,
    };
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
    return {
      latitude,
      longitude,
      address: `[Mock address near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}]`,
      provider: this.name,
    };
  }

  async calculateDistance(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<DistanceResult> {
    const meters = haversineMeters(originLat, originLon, destLat, destLon);
    return {
      distanceMeters: Math.round(meters),
      distanceKm: parseFloat((meters / 1000).toFixed(3)),
    };
  }

  async calculateRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteResult> {
    const meters = haversineMeters(originLat, originLon, destLat, destLon);
    // Assume road distance is ~1.3x straight-line distance
    const roadEstimateMeters = meters * 1.3;
    const durationSeconds = Math.round((roadEstimateMeters / 1000 / this.avgSpeedKmh) * 3600);
    const etaMinutes = Math.ceil(durationSeconds / 60);
    return {
      distanceMeters: Math.round(roadEstimateMeters),
      durationSeconds,
      etaMinutes,
      provider: `${this.name} (straight-line estimate — not a real road route)`,
    };
  }

  async calculateETA(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteResult> {
    return this.calculateRoute(originLat, originLon, destLat, destLon);
  }

  /**
   * Deterministic pseudo-hash in [-1, 1] for an input string.
   * Used only to produce varied mock coordinates.
   */
  private pseudoHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) & 0xffffffff;
    }
    // Normalise to [-0.5, 0.5]
    return ((hash >>> 0) / 0xffffffff) - 0.5;
  }
}

/**
 * Haversine formula — straight-line distance over a sphere.
 * Returns distance in metres.
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
