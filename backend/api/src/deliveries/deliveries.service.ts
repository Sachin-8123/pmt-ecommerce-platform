import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus, OrderStatus, PaymentStatus, Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { CompleteDeliveryDto } from './dto/complete-delivery.dto';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryFailureDto } from './dto/delivery-failure.dto';
import { DeliveryQueryDto } from './dto/delivery-query.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

const deliveryInclude = {
  order: {
    include: {
      address: true,
      items: {
        include: { product: { select: { id: true, name: true, vendorId: true, vendor: { select: { id: true, businessName: true } } } } },
      },
    },
  },
  deliveryPartner: { include: { user: { select: { id: true, name: true, phone: true, email: true } } } },
} as const;

type DeliveryWithDetails = Prisma.DeliveryGetPayload<{ include: typeof deliveryInclude }>;

@Injectable()
export class DeliveriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: User, dto: CreateDeliveryDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { items: { include: { product: true } }, payments: true, address: true, delivery: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    await this.assertOrderManager(user, order);
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.DELIVERED) {
      throw new ConflictException('This order cannot receive a delivery');
    }
    if (!order.address) throw new ConflictException('Order has no delivery address');
    const cod = order.payments.some((payment) => payment.paymentMethod === 'COD' && payment.status === PaymentStatus.PENDING);
    if (order.paymentStatus !== PaymentStatus.PAID && !cod) {
      throw new ConflictException('Order is not paid or valid for COD delivery');
    }
    if (order.delivery) throw new ConflictException('An active delivery already exists for this order');
    try {
      return await this.prisma.delivery.create({
        data: { orderId: order.id, status: DeliveryStatus.PENDING },
        include: deliveryInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An active delivery already exists for this order');
      }
      throw error;
    }
  }

  async assign(user: User, id: string, dto: AssignDeliveryDto) {
    const delivery = await this.requireDelivery(id);
    await this.assertOrderManager(user, delivery.order);
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { id: dto.deliveryPartnerId },
      include: { user: true },
    });
    if (!partner) throw new NotFoundException('Delivery partner not found');
    const partnerUser = await this.prisma.user.findUnique({ where: { id: partner.userId } });
    if (!partnerUser?.isActive || partner.status !== 'AVAILABLE' || !partner.isAvailable) {
      throw new ConflictException('Delivery partner is not available');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const partnerUpdate = await tx.deliveryPartner.updateMany({
        where: { id: dto.deliveryPartnerId, status: 'AVAILABLE', isAvailable: true },
        data: { status: 'BUSY', isAvailable: false },
      });
      if (partnerUpdate.count !== 1) throw new ConflictException('Delivery partner is no longer available');
      const deliveryUpdate = await tx.delivery.updateMany({
        where: { id, status: DeliveryStatus.PENDING, deliveryPartnerId: null },
        data: { deliveryPartnerId: dto.deliveryPartnerId, status: DeliveryStatus.ASSIGNED },
      });
      if (deliveryUpdate.count !== 1) throw new ConflictException('Delivery is already assigned');
      return tx.delivery.findUniqueOrThrow({ where: { id }, include: deliveryInclude });
    });
    return result;
  }

  async updateStatus(user: User, id: string, dto: UpdateDeliveryStatusDto) {
    const delivery = await this.requireDelivery(id);
    await this.assertOrderManager(user, delivery.order);
    this.assertTransition(delivery.status, dto.status);
    const result = await this.prisma.delivery.update({ where: { id }, data: { status: dto.status }, include: deliveryInclude });
    if (dto.status === DeliveryStatus.OUT_FOR_DELIVERY) {
      await this.prisma.order.update({ where: { id: delivery.orderId }, data: { status: OrderStatus.OUT_FOR_DELIVERY } });
    }
    return result;
  }

  async pickup(user: User, id: string) {
    const partner = await this.requireOwnPartner(user);
    const result = await this.prisma.delivery.updateMany({
      where: { id, deliveryPartnerId: partner.id, status: DeliveryStatus.ASSIGNED },
      data: { status: DeliveryStatus.PICKED_UP, pickupTime: new Date() },
    });
    if (result.count !== 1) throw new ForbiddenException('Delivery is not assigned to you or cannot be picked up');
    return this.getDetails(user, id);
  }

  async outForDelivery(user: User, id: string) {
    const partner = await this.requireOwnPartner(user);
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.delivery.updateMany({
        where: { id, deliveryPartnerId: partner.id, status: DeliveryStatus.PICKED_UP },
        data: { status: DeliveryStatus.OUT_FOR_DELIVERY },
      });
      if (updated.count !== 1) throw new ForbiddenException('Delivery must be picked up before going out for delivery');
      await tx.order.update({ where: { id: (await tx.delivery.findUniqueOrThrow({ where: { id } })).orderId }, data: { status: OrderStatus.OUT_FOR_DELIVERY } });
      return tx.delivery.findUniqueOrThrow({ where: { id }, include: deliveryInclude });
    });
    return result;
  }

  async complete(user: User, id: string, _dto: CompleteDeliveryDto) {
    const partner = await this.requireOwnPartner(user);
    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findFirst({ where: { id, deliveryPartnerId: partner.id } });
      if (!delivery || delivery.status !== DeliveryStatus.OUT_FOR_DELIVERY) {
        throw new ForbiddenException('Only an out-for-delivery assignment can be completed');
      }
      const updated = await tx.delivery.updateMany({
        where: { id, deliveryPartnerId: partner.id, status: DeliveryStatus.OUT_FOR_DELIVERY },
        data: { status: DeliveryStatus.DELIVERED, deliveredTime: new Date() },
      });
      if (updated.count !== 1) throw new ConflictException('Delivery was already completed');
      await tx.order.update({ where: { id: delivery.orderId }, data: { status: OrderStatus.DELIVERED } });
      await tx.deliveryPartner.update({ where: { id: partner.id }, data: { status: 'AVAILABLE', isAvailable: true } });
      return tx.delivery.findUniqueOrThrow({ where: { id }, include: deliveryInclude });
    });
  }

  async fail(user: User, id: string, dto: DeliveryFailureDto) {
    const delivery = await this.requireDelivery(id);
    const isAdmin = user.role === UserRole.ADMIN;
    if (!isAdmin) {
      const partner = await this.requireOwnPartner(user);
      if (delivery.deliveryPartnerId !== partner.id) throw new ForbiddenException('You do not own this delivery');
    }
    const terminalStatuses = new Set<DeliveryStatus>([DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED]);
    if (terminalStatuses.has(delivery.status)) {
      throw new ConflictException('Completed or cancelled deliveries cannot fail');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.delivery.updateMany({
        where: { id, status: { notIn: [DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED] } },
        data: { status: DeliveryStatus.FAILED, failureReason: dto.reason.trim() },
      });
      if (updated.count !== 1) throw new ConflictException('Delivery was already changed');
      if (delivery.deliveryPartnerId) {
        await tx.deliveryPartner.update({ where: { id: delivery.deliveryPartnerId }, data: { status: 'AVAILABLE', isAvailable: true } });
      }
      return tx.delivery.findUniqueOrThrow({ where: { id }, include: deliveryInclude });
    });
  }

  async getDetails(user: User, id: string) {
    const delivery = await this.requireDelivery(id);
    if (!(await this.canView(user, delivery))) throw new NotFoundException('Delivery not found');
    return this.safeDelivery(delivery, user.role === UserRole.CUSTOMER);
  }

  async customerDelivery(user: User, orderId: string) {
    if (user.role !== UserRole.CUSTOMER) throw new ForbiddenException('Only customers can view customer delivery details');
    const delivery = await this.prisma.delivery.findFirst({ where: { orderId, order: { userId: user.id } }, include: deliveryInclude });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return this.safeDelivery(delivery, true);
  }

  async partnerDeliveries(user: User, query: DeliveryQueryDto) {
    const partner = await this.requireOwnPartner(user);
    const where: Prisma.DeliveryWhereInput = { deliveryPartnerId: partner.id, ...(query.status ? { status: query.status } : {}) };
    return this.paginate(where, query);
  }

  async adminDeliveries(user: User, query: DeliveryQueryDto) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException('Only admins can view all deliveries');
    const where = this.buildQuery(query);
    return this.paginate(where, query);
  }

  async vendorDeliveries(user: User, query: DeliveryQueryDto) {
    if (user.role !== UserRole.VENDOR && user.role !== UserRole.STAFF) throw new ForbiddenException('Only vendor users can view vendor deliveries');
    const vendorIds = await this.getVendorIds(user);
    const where: Prisma.DeliveryWhereInput = { ...this.buildQuery(query), order: { items: { some: { product: { vendorId: { in: vendorIds } } } } } };
    return this.paginate(where, query, vendorIds);
  }

  private async paginate(where: Prisma.DeliveryWhereInput, query: DeliveryQueryDto, vendorIds?: string[]) {
    const [deliveries, total] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: { createdAt: 'desc' }, include: deliveryInclude }),
      this.prisma.delivery.count({ where }),
    ]);
    return { data: deliveries.map((delivery) => this.safeDelivery(delivery, false, vendorIds)), page: query.page, limit: query.limit, total };
  }

  private buildQuery(query: DeliveryQueryDto): Prisma.DeliveryWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.deliveryPartnerId ? { deliveryPartnerId: query.deliveryPartnerId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
    };
  }

  private async requireDelivery(id: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id }, include: deliveryInclude });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  private async requireOwnPartner(user: User) {
    if (user.role !== UserRole.DELIVERY_PARTNER) throw new ForbiddenException('Only delivery partners can perform this action');
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { userId: user.id } });
    if (!partner) throw new NotFoundException('Delivery partner profile not found');
    return partner;
  }

  private async assertOrderManager(user: User, order: DeliveryWithDetails['order'] | Prisma.OrderGetPayload<{ include: { items: { include: { product: true } } } }>) {
    if (user.role === UserRole.ADMIN) return;
    if (user.role !== UserRole.VENDOR && user.role !== UserRole.STAFF) throw new ForbiddenException('You cannot manage this delivery');
    const vendorIds = await this.getVendorIds(user);
    if (!order.items.some((item) => vendorIds.includes(item.product.vendorId))) throw new ForbiddenException('You cannot manage this delivery');
  }

  private async canView(user: User, delivery: DeliveryWithDetails) {
    if (user.role === UserRole.ADMIN) return true;
    if (user.role === UserRole.CUSTOMER) return delivery.order.userId === user.id;
    if (user.role === UserRole.DELIVERY_PARTNER) return delivery.deliveryPartner?.userId === user.id;
    if (user.role === UserRole.VENDOR || user.role === UserRole.STAFF) {
      const vendorIds = await this.getVendorIds(user);
      return delivery.order.items.some((item) => vendorIds.includes(item.product.vendorId));
    }
    return false;
  }

  private async getVendorIds(user: User) {
    if (user.role === UserRole.VENDOR) {
      const vendors = await this.prisma.vendor.findMany({ where: { ownerId: user.id }, select: { id: true } });
      return vendors.map((vendor) => vendor.id);
    }
    const staff = await this.prisma.vendorStaff.findMany({ where: { userId: user.id }, select: { vendorId: true } });
    return staff.map((entry) => entry.vendorId);
  }

  private assertTransition(from: DeliveryStatus, to: DeliveryStatus) {
    const allowed: Record<DeliveryStatus, DeliveryStatus[]> = {
      PENDING: [DeliveryStatus.ASSIGNED, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED],
      ASSIGNED: [DeliveryStatus.PICKED_UP, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED],
      PICKED_UP: [DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.FAILED],
      OUT_FOR_DELIVERY: [DeliveryStatus.DELIVERED, DeliveryStatus.FAILED],
      DELIVERED: [],
      FAILED: [],
      CANCELLED: [],
    };
    if (!allowed[from].includes(to)) throw new ConflictException(`Invalid delivery transition: ${from} to ${to}`);
  }

  private safeDelivery(delivery: DeliveryWithDetails, customerView: boolean, vendorIds?: string[]) {
    const items = vendorIds
      ? delivery.order.items.filter((item) => vendorIds.includes(item.product.vendorId))
      : delivery.order.items;
    return {
      id: delivery.id,
      orderId: delivery.orderId,
      status: delivery.status,
      pickupTime: delivery.pickupTime,
      deliveredTime: delivery.deliveredTime,
      failureReason: delivery.failureReason,
      deliveryPartner: delivery.deliveryPartner
        ? { id: delivery.deliveryPartner.id, name: delivery.deliveryPartner.user.name, phone: delivery.deliveryPartner.user.phone }
        : null,
      address: customerView || !vendorIds ? delivery.order.address : undefined,
      vendorItemCount: items.length,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
    };
  }
}
