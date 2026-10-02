import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DeliveryStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingService } from '../deliveries/tracking.service';
import { MapsService } from './maps.service';

const ACTIVE_STATUSES = new Set<DeliveryStatus>([
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.OUT_FOR_DELIVERY,
]);

@Injectable()
export class DeliveryEtaService {
  private readonly logger = new Logger(DeliveryEtaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trackingService: TrackingService,
    private readonly mapsService: MapsService,
  ) {}

  async getEta(user: User, deliveryId: string) {
    // Use existing tracking service authorization (reuses existing RBAC)
    const canView = await this.trackingService.canView(user, deliveryId);
    if (!canView) throw new NotFoundException('Delivery not found');

    // Load delivery with address and order
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        order: {
          include: { address: true },
        },
      },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');

    // Latest GPS location (ORDER BY recordedAt DESC LIMIT 1 — uses index)
    const latestLocation = await this.prisma.deliveryLocation.findFirst({
      where: { deliveryId },
      orderBy: { recordedAt: 'desc' },
    });

    const staleSeconds = this.configNumber('GPS_LOCATION_STALE_SECONDS', 60);
    const isLive = ACTIVE_STATUSES.has(delivery.status);
    const isStale =
      !isLive ||
      !latestLocation ||
      Date.now() - latestLocation.recordedAt.getTime() > staleSeconds * 1000;

    // Destination coordinates from stored order address — never from client
    const address = delivery.order?.address;
    const destLat = address?.latitude ?? null;
    const destLon = address?.longitude ?? null;

    const base = {
      deliveryId,
      status: delivery.status,
      latestLocation: latestLocation
        ? {
            latitude: latestLocation.latitude,
            longitude: latestLocation.longitude,
            accuracy: latestLocation.accuracy,
            heading: latestLocation.heading,
            speed: latestLocation.speed,
            recordedAt: latestLocation.recordedAt,
          }
        : null,
      destination: destLat !== null && destLon !== null ? { latitude: destLat, longitude: destLon } : null,
      isStale,
    };

    // Non-active deliveries: return status with no live ETA
    if (!isLive || !latestLocation) {
      return {
        ...base,
        distanceMeters: null,
        durationSeconds: null,
        etaMinutes: null,
        provider: null,
        note: !isLive
          ? 'Delivery is not active; live ETA is not available.'
          : 'No GPS location recorded yet; ETA not available.',
      };
    }

    // Missing destination coordinates
    if (destLat === null || destLon === null) {
      return {
        ...base,
        distanceMeters: null,
        durationSeconds: null,
        etaMinutes: null,
        provider: null,
        note: 'Destination coordinates are not available. Geocode the delivery address first.',
      };
    }

    // Calculate route from current partner location to destination
    try {
      const route = await this.mapsService.calculateRoute(
        latestLocation.latitude,
        latestLocation.longitude,
        destLat,
        destLon,
      );
      return {
        ...base,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        etaMinutes: route.etaMinutes,
        provider: route.provider,
      };
    } catch (e) {
      // Do not log provider error text: it can contain request URLs or provider details.
      this.logger.warn('ETA calculation temporarily unavailable');
      return {
        ...base,
        distanceMeters: null,
        durationSeconds: null,
        etaMinutes: null,
        provider: null,
        note: 'ETA calculation temporarily unavailable.',
      };
    }
  }

  /**
   * Route representation of the live ETA. Origin and destination deliberately
   * come only from persisted delivery data; this endpoint accepts no coordinates.
   */
  async getRoute(user: User, deliveryId: string) {
    const canView = await this.trackingService.canView(user, deliveryId);
    if (!canView) throw new NotFoundException('Delivery not found');

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: { include: { address: true } } },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');

    const address = delivery.order.address;
    const destination =
      address.latitude !== null && address.longitude !== null
        ? { latitude: address.latitude, longitude: address.longitude }
        : null;
    if (!destination) {
      throw new ConflictException('Destination coordinates are not available. Geocode the delivery address first.');
    }

    const latestLocation = await this.prisma.deliveryLocation.findFirst({
      where: { deliveryId },
      orderBy: { recordedAt: 'desc' },
    });
    const isLive = ACTIVE_STATUSES.has(delivery.status);
    const staleSeconds = this.configNumber('GPS_LOCATION_STALE_SECONDS', 60);
    const isStale =
      !isLive ||
      !latestLocation ||
      Date.now() - latestLocation.recordedAt.getTime() > staleSeconds * 1000;
    const origin = latestLocation
      ? {
          latitude: latestLocation.latitude,
          longitude: latestLocation.longitude,
          recordedAt: latestLocation.recordedAt,
        }
      : null;
    const base = {
      deliveryId,
      status: delivery.status,
      origin,
      destination,
      isStale,
    };

    // Completed, cancelled, failed, or pre-dispatch deliveries do not have a
    // live route. The last known point is retained for an authorized viewer.
    if (!isLive || !latestLocation) {
      return {
        ...base,
        distanceMeters: null,
        durationSeconds: null,
        etaMinutes: null,
        provider: this.mapsService.providerName,
        note: !isLive
          ? 'Delivery is not active; live route is not available.'
          : 'No GPS location recorded yet; live route is not available.',
      };
    }

    try {
      const route = await this.mapsService.calculateRoute(
        latestLocation.latitude,
        latestLocation.longitude,
        destination.latitude,
        destination.longitude,
      );
      return {
        ...base,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        etaMinutes: route.etaMinutes,
        provider: route.provider,
        ...(isStale ? { note: 'Route and ETA are based on a stale GPS location.' } : {}),
      };
    } catch {
      this.logger.warn('Live route calculation temporarily unavailable');
      return {
        ...base,
        distanceMeters: null,
        durationSeconds: null,
        etaMinutes: null,
        provider: this.mapsService.providerName,
        note: 'Route calculation temporarily unavailable.',
      };
    }
  }

  private configNumber(name: string, fallback: number): number {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  }
}
