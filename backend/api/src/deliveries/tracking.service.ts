import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus, Prisma, User, UserRole } from '@prisma/client';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { LocationQueryDto } from './dto/location-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

const activeStatuses = new Set<DeliveryStatus>([
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.OUT_FOR_DELIVERY,
]);

export interface FormattedDeliveryLocation {
  deliveryId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: Date;
}

@Injectable()
export class TrackingService {
  private readonly lastUpdates = new Map<string, number>();
  readonly locationUpdates$ = new Subject<FormattedDeliveryLocation>();

  constructor(private readonly prisma: PrismaService) {}

  async update(user: User, deliveryId: string, dto: UpdateLocationDto) {
    this.validateCoordinates(dto);

    const delivery = await this.requireDelivery(deliveryId);
    if (user.role !== UserRole.DELIVERY_PARTNER || delivery.deliveryPartner?.userId !== user.id) {
      throw new ForbiddenException('Only the assigned delivery partner can update location');
    }
    if (!activeStatuses.has(delivery.status)) {
      throw new ConflictException('Location updates are closed for this delivery');
    }

    this.enforceRateLimit(deliveryId);

    const now = new Date();
    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : now;
    if (isNaN(recordedAt.getTime())) {
      throw new BadRequestException('Invalid recordedAt timestamp');
    }
    if (recordedAt.getTime() > now.getTime() + 30_000) {
      throw new ConflictException('Location timestamp cannot be in the future');
    }

    const location = await this.prisma.deliveryLocation.create({
      data: {
        deliveryId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        heading: dto.heading,
        speed: dto.speed,
        recordedAt,
      },
    });

    if (delivery.deliveryPartnerId) {
      await this.prisma.deliveryPartner.update({
        where: { id: delivery.deliveryPartnerId },
        data: { currentLatitude: dto.latitude, currentLongitude: dto.longitude },
      }).catch(() => null);
    }

    this.lastUpdates.set(deliveryId, Date.now());
    const formatted = this.formatLocation(location);
    this.locationUpdates$.next(formatted);
    return formatted;
  }

  async latest(user: User, deliveryId: string) {
    await this.assertCanView(user, deliveryId);
    const location = await this.prisma.deliveryLocation.findFirst({
      where: { deliveryId },
      orderBy: { recordedAt: 'desc' },
    });
    return location ? this.formatLocation(location) : null;
  }

  async history(user: User, deliveryId: string, query: LocationQueryDto) {
    await this.assertCanView(user, deliveryId);
    const limit = Math.min(Math.max(query.limit || 100, 1), 500);
    const locations = await this.prisma.deliveryLocation.findMany({
      where: { deliveryId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
    return locations.map((location) => this.formatLocation(location));
  }

  async tracking(user: User, deliveryId: string) {
    const delivery = await this.assertCanView(user, deliveryId);
    const latest = await this.prisma.deliveryLocation.findFirst({
      where: { deliveryId },
      orderBy: { recordedAt: 'desc' },
    });
    const staleSeconds = this.configNumber('GPS_LOCATION_STALE_SECONDS', 60);
    const isLive = activeStatuses.has(delivery.status);
    const isStale = !isLive || !latest || Date.now() - latest.recordedAt.getTime() > staleSeconds * 1000;
    return {
      deliveryId,
      status: delivery.status,
      latestLocation: latest ? this.formatLocation(latest) : null,
      isStale,
    };
  }

  async canView(user: User, deliveryId: string) {
    try {
      await this.assertCanView(user, deliveryId);
      return true;
    } catch {
      return false;
    }
  }

  private validateCoordinates(dto: UpdateLocationDto) {
    if (typeof dto.latitude !== 'number' || isNaN(dto.latitude) || dto.latitude < -90 || dto.latitude > 90) {
      throw new BadRequestException('Latitude must be between -90 and 90');
    }
    if (typeof dto.longitude !== 'number' || isNaN(dto.longitude) || dto.longitude < -180 || dto.longitude > 180) {
      throw new BadRequestException('Longitude must be between -180 and 180');
    }
    if (dto.accuracy !== undefined && dto.accuracy !== null && (typeof dto.accuracy !== 'number' || isNaN(dto.accuracy) || dto.accuracy < 0)) {
      throw new BadRequestException('Accuracy must be a non-negative number');
    }
    if (dto.heading !== undefined && dto.heading !== null && (typeof dto.heading !== 'number' || isNaN(dto.heading) || dto.heading < 0 || dto.heading > 360)) {
      throw new BadRequestException('Heading must be between 0 and 360');
    }
    if (dto.speed !== undefined && dto.speed !== null && (typeof dto.speed !== 'number' || isNaN(dto.speed) || dto.speed < 0)) {
      throw new BadRequestException('Speed must be a non-negative number');
    }
  }

  private async assertCanView(user: User, deliveryId: string) {
    const delivery = await this.requireDelivery(deliveryId);
    if (user.role === UserRole.ADMIN) return delivery;
    if (user.role === UserRole.CUSTOMER && delivery.order.userId === user.id) return delivery;
    if (user.role === UserRole.DELIVERY_PARTNER && delivery.deliveryPartner?.userId === user.id) return delivery;
    if (user.role === UserRole.VENDOR || user.role === UserRole.STAFF) {
      const vendorIds = await this.getVendorIds(user);
      if (delivery.order.items.some((item) => vendorIds.includes(item.product.vendorId))) return delivery;
    }
    throw new NotFoundException('Delivery not found');
  }

  private async requireDelivery(id: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: {
        deliveryPartner: { include: { user: true } },
        order: { include: { items: { include: { product: true } } } },
      },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  private async getVendorIds(user: User) {
    if (user.role === UserRole.VENDOR) {
      const vendors = await this.prisma.vendor.findMany({ where: { ownerId: user.id }, select: { id: true } });
      return vendors.map((vendor) => vendor.id);
    }
    const staff = await this.prisma.vendorStaff.findMany({ where: { userId: user.id }, select: { vendorId: true } });
    return staff.map((entry) => entry.vendorId);
  }

  private enforceRateLimit(deliveryId: string) {
    const minimumInterval = this.configNumber('GPS_UPDATE_MIN_INTERVAL_MS', 5000);
    if (minimumInterval <= 0) return;
    const previous = this.lastUpdates.get(deliveryId);
    if (previous && Date.now() - previous < minimumInterval) {
      throw new HttpException('GPS updates are arriving too quickly', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private configNumber(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private formatLocation(location: Prisma.DeliveryLocationGetPayload<{}>): FormattedDeliveryLocation {
    return {
      deliveryId: location.deliveryId,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      heading: location.heading,
      speed: location.speed,
      recordedAt: location.recordedAt,
    };
  }
}

