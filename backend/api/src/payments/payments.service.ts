import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderStatus, Payment, PaymentStatus, Prisma, User, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto, PaymentMethod } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { PaymentWebhookDto, PaymentWebhookType } from './dto/webhook.dto';
import { MockPaymentProvider } from './providers/mock-payment.provider';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mockProvider: MockPaymentProvider,
  ) {}

  async create(user: User, dto: CreatePaymentDto, idempotencyKey?: string) {
    this.assertCustomer(user);
    const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, userId: user.id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    this.assertOrderEligible(order);

    const normalizedKey = idempotencyKey?.trim().slice(0, 200);
    if (normalizedKey) {
      const existingByKey = await this.prisma.payment.findUnique({ where: { idempotencyKey: normalizedKey } });
      if (existingByKey) {
        return this.safePayment(existingByKey);
      }
    }

    const existingPending = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: PaymentStatus.PENDING, paymentMethod: dto.paymentMethod },
      orderBy: { createdAt: 'desc' },
    });
    if (existingPending) {
      return this.safePayment(existingPending);
    }
    if (dto.paymentMethod === PaymentMethod.ONLINE) {
      const alreadyPaid = await this.prisma.payment.findFirst({
        where: { orderId: order.id, status: PaymentStatus.PAID },
      });
      if (alreadyPaid) {
        throw new ConflictException('Order is already paid');
      }
    }

    const paymentId = randomUUID();
    const amount = order.totalAmount.toNumber();
    let providerOrderId: string | undefined;
    if (dto.paymentMethod === PaymentMethod.ONLINE) {
      providerOrderId = (await this.provider().createPaymentOrder({
        paymentId,
        orderId: order.id,
        amount,
        currency: 'INR',
      })).providerOrderId;
    }

    try {
      const payment = await this.prisma.payment.create({
        data: {
          id: paymentId,
          orderId: order.id,
          provider: dto.paymentMethod === PaymentMethod.COD ? 'cod' : this.provider().name,
          providerOrderId,
          paymentMethod: dto.paymentMethod,
          currency: 'INR',
          idempotencyKey: normalizedKey,
          amount: order.totalAmount,
          status: PaymentStatus.PENDING,
        },
      });
      return this.safePayment(payment);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && normalizedKey) {
        const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey: normalizedKey } });
        if (existing) return this.safePayment(existing);
      }
      throw error;
    }
  }

  async retry(user: User, dto: CreatePaymentDto, idempotencyKey?: string) {
    if (dto.paymentMethod === PaymentMethod.COD) {
      throw new BadRequestException('COD does not support online payment retry');
    }
    return this.create(user, dto, idempotencyKey);
  }

  async verify(user: User, dto: VerifyPaymentDto) {
    this.assertCustomer(user);
    const payment = await this.prisma.payment.findFirst({
      where: { id: dto.paymentId, order: { userId: user.id } },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === PaymentStatus.PAID) return this.safePayment(payment);
    if (payment.paymentMethod === PaymentMethod.COD) {
      throw new BadRequestException('COD payments cannot be verified online');
    }
    this.assertOrderEligible(payment.order);
    if (payment.providerOrderId !== dto.providerOrderId) {
      throw new BadRequestException('Provider order does not match the payment');
    }

    const valid = await this.provider().verifyPayment({
      providerOrderId: dto.providerOrderId,
      providerPaymentId: dto.providerPaymentId,
      signature: dto.signature,
      amount: payment.amount.toNumber(),
      currency: payment.currency,
    });
    if (!valid) throw new UnauthorizedException('Invalid payment signature');

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.payment.findUnique({ where: { id: payment.id }, include: { order: true } });
      if (!current) throw new NotFoundException('Payment not found');
      if (current.status === PaymentStatus.PAID) return current;
      if (current.order.status === OrderStatus.CANCELLED) {
        throw new ConflictException('Cancelled orders cannot be paid');
      }
      await tx.order.update({
        where: { id: current.orderId },
        data: { paymentStatus: PaymentStatus.PAID, status: OrderStatus.CONFIRMED },
      });
      return tx.payment.update({
        where: { id: current.id },
        data: {
          status: PaymentStatus.PAID,
          providerPaymentId: dto.providerPaymentId,
          transactionId: dto.providerPaymentId,
          paidAt: new Date(),
        },
        include: { order: true },
      });
    });
    return this.safePayment(updated);
  }

  async webhook(dto: PaymentWebhookDto, signature: string) {
    if (!signature) throw new UnauthorizedException('Missing webhook signature');
    const valid = await this.provider().verifyWebhook({ ...dto, signature });
    if (!valid) throw new UnauthorizedException('Invalid webhook signature');

    const existingEvent = await this.prisma.payment.findUnique({ where: { webhookEventId: dto.eventId } });
    if (existingEvent) return { received: true, duplicate: true, payment: this.safePayment(existingEvent) };
    const payment = await this.prisma.payment.findFirst({
      where: { providerOrderId: dto.providerOrderId },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.amount.toNumber() !== dto.amount || payment.currency !== dto.currency) {
      throw new BadRequestException('Webhook amount or currency does not match the payment');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.payment.findUnique({ where: { id: payment.id }, include: { order: true } });
      if (!current) throw new NotFoundException('Payment not found');
      if (current.webhookEventId) return current;
      const successful = dto.eventType === PaymentWebhookType.SUCCESS;
      if (successful && current.order.status === OrderStatus.CANCELLED) {
        throw new ConflictException('Cancelled orders cannot be paid');
      }
      if (successful && current.status !== PaymentStatus.PAID) {
        await tx.order.update({
          where: { id: current.orderId },
          data: { paymentStatus: PaymentStatus.PAID, status: OrderStatus.CONFIRMED },
        });
      }
      return tx.payment.update({
        where: { id: current.id },
        data: {
          status: successful && current.status !== PaymentStatus.PAID ? PaymentStatus.PAID :
            successful ? current.status : PaymentStatus.FAILED,
          providerPaymentId: dto.providerPaymentId,
          transactionId: dto.providerPaymentId,
          webhookEventId: dto.eventId,
          paidAt: successful ? current.paidAt ?? new Date() : current.paidAt,
        },
      });
    });
    return { received: true, duplicate: false, payment: this.safePayment(updated) };
  }

  async status(user: User, orderId: string) {
    const payment = await this.findAccessiblePayment(user, orderId);
    const vendorView = user.role === UserRole.VENDOR || user.role === UserRole.STAFF;
    return this.safePayment(payment, !vendorView);
  }

  async history(user: User, orderId: string, query: PaymentQueryDto) {
    if (user.role !== UserRole.CUSTOMER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only customers and admins can view payment history');
    }
    const order = await this.prisma.order.findFirst({
      where: user.role === UserRole.ADMIN ? { id: orderId } : { id: orderId, userId: user.id },
    });
    if (!order) throw new NotFoundException('Order not found');
    const [payments, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.payment.count({ where: { orderId } }),
    ]);
    return { data: payments.map((payment) => this.safePayment(payment)), page: query.page, limit: query.limit, total };
  }

  private async findAccessiblePayment(user: User, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (user.role === UserRole.ADMIN) {
      // Admin access is platform-wide.
    } else if (user.role === UserRole.CUSTOMER) {
      if (order.userId !== user.id) throw new NotFoundException('Order not found');
    } else if (user.role === UserRole.VENDOR || user.role === UserRole.STAFF) {
      const vendorIds = await this.getVendorIds(user);
      if (!order.items.some((item) => vendorIds.includes(item.product.vendorId))) {
        throw new NotFoundException('Order not found');
      }
    } else {
      throw new ForbiddenException('You do not have permission to view payment status');
    }
    const payment = await this.prisma.payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  private async getVendorIds(user: User) {
    if (user.role === UserRole.VENDOR) {
      const vendors = await this.prisma.vendor.findMany({ where: { ownerId: user.id }, select: { id: true } });
      return vendors.map((vendor) => vendor.id);
    }
    const staff = await this.prisma.vendorStaff.findMany({ where: { userId: user.id }, select: { vendorId: true } });
    return staff.map((entry) => entry.vendorId);
  }

  private provider() {
    const provider = process.env.PAYMENT_PROVIDER || 'mock';
    if (provider !== 'mock') throw new BadRequestException('Configured payment provider is not supported');
    return this.mockProvider;
  }

  private safePayment(payment: Payment, includeProviderRefs = true) {
    return {
      id: payment.id,
      orderId: payment.orderId,
      provider: payment.provider,
      ...(includeProviderRefs ? {
        providerOrderId: payment.providerOrderId,
        providerPaymentId: payment.providerPaymentId,
      } : {}),
      paymentMethod: payment.paymentMethod,
      currency: payment.currency,
      amount: payment.amount.toNumber(),
      status: payment.status,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private assertCustomer(user: User) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customers can make payments');
    }
  }

  private assertOrderEligible(order: { status: OrderStatus; paymentStatus: PaymentStatus }) {
    if (order.status === OrderStatus.CANCELLED) {
      throw new ConflictException('Cancelled orders cannot be paid');
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new ConflictException('Order is already paid');
    }
  }
}
