export interface GeocodeResult {
  address: string;
  latitude: number;
  longitude: number;
  provider: string;
}

export interface ReverseGeocodeResult {
  latitude: number;
  longitude: number;
  address: string;
  provider: string;
}

export interface DistanceResult {
  distanceMeters: number;
  distanceKm: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  etaMinutes: number;
  provider: string;
}

export interface MapsProvider {
  readonly name: string;
  geocode(address: string): Promise<GeocodeResult>;
  reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult>;
  calculateDistance(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<DistanceResult>;
  calculateRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteResult>;
  /** Alias for callers that only need an arrival estimate. */
  calculateETA(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteResult>;
}
