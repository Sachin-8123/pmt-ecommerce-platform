import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfillmentType,
  OrderStatus,
  Prisma,
  User,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';

const orderInclude = {
  address: true,
  items: {
    orderBy: { id: 'asc' as const },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          vendorId: true,
          vendor: { select: { id: true, businessName: true } },
        },
      },
    },
  },
} as const;

type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(user: User) {
    this.assertCustomer(user);
    const cart = await this.prisma.cart.findFirst({
      where: { userId: user.id },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sellingPrice: true,
                stockQuantity: true,
                isActive: true,
                vendor: { select: { id: true, businessName: true } },
              },
            },
          },
        },
      },
    });
    const items = cart?.items ?? [];
    let subtotal = new Prisma.Decimal(0);
    const issues: string[] = [];
    const previewItems = items.map((item) => {
      const available = !!item.product?.isActive && item.quantity <= (item.product?.stockQuantity ?? 0);
      if (!item.product) {
        issues.push(`Product for cart item ${item.id} no longer exists`);
      } else if (!item.product.isActive) {
        issues.push(`${item.product.name} is no longer active`);
      } else if (item.quantity > item.product.stockQuantity) {
        issues.push(`${item.product.name} does not have enough stock`);
      }
      const unitPrice = item.product?.sellingPrice ?? new Prisma.Decimal(0);
      const itemSubtotal = available ? unitPrice.mul(item.quantity) : new Prisma.Decimal(0);
      subtotal = subtotal.add(itemSubtotal);
      return {
        id: item.id,
        productId: item.productId,
        productName: item.product?.name ?? 'Unavailable product',
        vendor: item.product?.vendor ?? null,
        quantity: item.quantity,
        unitPrice: unitPrice.toNumber(),
        subtotal: itemSubtotal.toNumber(),
        available,
      };
    });

    return {
      items: previewItems,
      subtotal: subtotal.toNumber(),
      shippingCharge: 0,
      discount: 0,
      tax: 0,
      total: subtotal.toNumber(),
      canCheckout: items.length > 0 && issues.length === 0,
      issues,
    };
  }

  async create(user: User, dto: CreateOrderDto) {
    this.assertCustomer(user);
    const order = await this.prisma.$transaction(async (tx) => {
      const address = await tx.address.findFirst({ where: { id: dto.addressId, userId: user.id } });
      if (!address) {
        throw new NotFoundException('Address not found');
      }

      const cart = await tx.cart.findFirst({
        where: { userId: user.id },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  vendorId: true,
                  sellingPrice: true,
                  stockQuantity: true,
                  isActive: true,
                },
              },
            },
          },
        },
      });
      if (!cart || cart.items.length === 0) {
        throw new ConflictException('Cart is empty');
      }

      let subtotal = new Prisma.Decimal(0);
      for (const item of cart.items) {
        if (!item.product || !item.product.isActive) {
          throw new ConflictException('Cart contains an inactive or unavailable product');
        }
        if (item.quantity > item.product.stockQuantity) {
          throw new ConflictException(`Insufficient stock for ${item.product.name}`);
        }
        subtotal = subtotal.add(item.product.sellingPrice.mul(item.quantity));
      }

      for (const item of cart.items) {
        const result = await tx.product.updateMany({
          where: { id: item.productId, isActive: true, stockQuantity: { gte: item.quantity } },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        if (result.count !== 1) {
          throw new ConflictException('Stock changed while placing the order; please retry');
        }
      }

      const firstVendorId = cart.items[0].product.vendorId;
      const createdOrder = await tx.order.create({
        data: {
          orderNumber: `PMT-${Date.now()}-${randomUUID().slice(0, 8)}`,
          userId: user.id,
          vendorId: firstVendorId,
          addressId: address.id,
          subtotal,
          deliveryFee: 0,
          discount: 0,
          totalAmount: subtotal,
          fulfillment: FulfillmentType.DELIVERY,
          items: {
            create: cart.items.map((item) => {
              const unitPrice = item.product.sellingPrice;
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice,
                totalPrice: unitPrice.mul(item.quantity),
              };
            }),
          },
        },
        include: orderInclude,
      });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return createdOrder;
    });
    return this.formatOrder(order);
  }

  async findCustomerOrders(user: User, query: OrderQueryDto) {
    this.assertCustomer(user);
    const where: Prisma.OrderWhereInput = { userId: user.id };
    if (query.status) where.status = query.status;
    return this.paginate(where, query);
  }

  async findAdminOrders(user: User, query: OrderQueryDto) {
    this.assertRole(user, UserRole.ADMIN);
    const where = this.buildOrderFilter(query);
    return this.paginate(where, query);
  }

  async findVendorOrders(user: User, query: OrderQueryDto) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.VENDOR && user.role !== UserRole.STAFF) {
      throw new ForbiddenException('Only vendor users can view vendor orders');
    }
    const vendorIds = await this.getVendorIds(user);
    const where: Prisma.OrderWhereInput = {
      ...this.buildOrderFilter(query),
      items: { some: { product: { vendorId: { in: vendorIds } } } },
    };
    return this.paginate(where, query, vendorIds);
  }

  async findOne(user: User, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order || !(await this.canViewOrder(user, order))) {
      throw new NotFoundException('Order not found');
    }
    const vendorIds = user.role === UserRole.ADMIN || user.role === UserRole.CUSTOMER
      ? undefined
      : await this.getVendorIds(user);
    return this.formatOrder(order, vendorIds);
  }

  async cancel(user: User, id: string) {
    this.assertCustomer(user);
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, userId: user.id },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Order not found');
      const cancellableStatuses = new Set<OrderStatus>([
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.PROCESSING,
        OrderStatus.PACKED,
      ]);
      if (!cancellableStatuses.has(order.status)) {
        throw new ConflictException('Order can no longer be cancelled');
      }
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });
      }
      return tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED },
        include: orderInclude,
      });
    });
    return this.formatOrder(result);
  }

  private async paginate(where: Prisma.OrderWhereInput, query: OrderQueryDto, vendorIds?: string[]) {
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: orderInclude,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      data: orders.map((order) => this.formatOrder(order, vendorIds)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  private buildOrderFilter(query: OrderQueryDto): Prisma.OrderWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.vendorId ? { items: { some: { product: { vendorId: query.vendorId } } } } : {}),
      ...(query.search
        ? { OR: [{ id: { contains: query.search } }, { orderNumber: { contains: query.search } }] }
        : {}),
    };
  }

  private async getVendorIds(user: User) {
    if (user.role === UserRole.ADMIN) return undefined;
    if (user.role === UserRole.VENDOR) {
      const vendors = await this.prisma.vendor.findMany({ where: { ownerId: user.id }, select: { id: true } });
      return vendors.map((vendor) => vendor.id);
    }
    const staff = await this.prisma.vendorStaff.findMany({ where: { userId: user.id }, select: { vendorId: true } });
    return staff.map((entry) => entry.vendorId);
  }

  private async canViewOrder(user: User, order: OrderWithDetails) {
    if (user.role === UserRole.ADMIN || (user.role === UserRole.CUSTOMER && order.userId === user.id)) return true;
    if (user.role !== UserRole.VENDOR && user.role !== UserRole.STAFF) return false;
    const vendorIds = await this.getVendorIds(user);
    return order.items.some((item) => vendorIds?.includes(item.product.vendorId));
  }

  private formatOrder(order: OrderWithDetails, vendorIds?: string[]) {
    const visibleItems = vendorIds
      ? order.items.filter((item) => vendorIds.includes(item.product.vendorId))
      : order.items;
    const items = visibleItems.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      vendorId: item.product.vendorId,
      vendorName: item.product.vendor.businessName,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toNumber(),
      subtotal: item.totalPrice.toNumber(),
    }));
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      items,
      subtotal,
      shippingCharge: order.deliveryFee.toNumber(),
      discount: order.discount.toNumber(),
      tax: 0,
      total: vendorIds ? subtotal : order.totalAmount.toNumber(),
      address: order.address,
      createdAt: order.createdAt,
    };
  }

  private assertCustomer(user: User) {
    this.assertRole(user, UserRole.CUSTOMER);
  }

  private assertRole(user: User, role: UserRole) {
    if (user.role !== role) {
      throw new ForbiddenException('You do not have permission to access orders');
    }
  }
}
