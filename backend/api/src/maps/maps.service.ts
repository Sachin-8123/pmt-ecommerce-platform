import { Injectable, Logger } from '@nestjs/common';
import {
  DistanceResult,
  GeocodeResult,
  MapsProvider,
  ReverseGeocodeResult,
  RouteResult,
} from './providers/maps-provider.interface';
import { createMapsProvider } from './providers/osm.provider';

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  private readonly provider: MapsProvider;

  constructor() {
    this.provider = createMapsProvider();
    this.logger.log(`Maps provider: ${this.provider.name}`);
  }

  get providerName(): string {
    return this.provider.name;
  }

  async geocode(address: string): Promise<GeocodeResult> {
    return this.provider.geocode(address);
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
    return this.provider.reverseGeocode(latitude, longitude);
  }

  async calculateDistance(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<DistanceResult> {
    const result = await this.provider.calculateDistance(originLat, originLon, destLat, destLon);
    // Safety: distance must be non-negative
    return {
      ...result,
      distanceMeters: Math.max(0, result.distanceMeters),
      distanceKm: Math.max(0, result.distanceKm),
    };
  }

  async calculateRoute(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteResult> {
    const result = await this.provider.calculateRoute(originLat, originLon, destLat, destLon);
    return {
      ...result,
      distanceMeters: Math.max(0, result.distanceMeters),
      durationSeconds: Math.max(0, result.durationSeconds),
      etaMinutes: Math.max(0, result.etaMinutes),
    };
  }

  async calculateETA(
    originLat: number,
    originLon: number,
    destLat: number,
    destLon: number,
  ): Promise<RouteResult> {
    const result = await this.provider.calculateETA(originLat, originLon, destLat, destLon);
    return {
      ...result,
      distanceMeters: Math.max(0, result.distanceMeters),
      durationSeconds: Math.max(0, result.durationSeconds),
      etaMinutes: Math.max(0, result.etaMinutes),
    };
  }
}
