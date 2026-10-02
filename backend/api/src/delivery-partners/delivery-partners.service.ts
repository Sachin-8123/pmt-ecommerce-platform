import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryPartnerDto } from './dto/create-delivery-partner.dto';
import { DeliveryPartnerQueryDto } from './dto/delivery-partner-query.dto';
import { DeliveryPartnerStatus, UpdateDeliveryPartnerStatusDto } from './dto/update-delivery-partner-status.dto';

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
} as const;

@Injectable()
export class DeliveryPartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(admin: User, dto: CreateDeliveryPartnerDto) {
    this.assertAdmin(admin);
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.DELIVERY_PARTNER || !user.isActive) {
      throw new ConflictException('User is not eligible to become a delivery partner');
    }
    const existing = await this.prisma.deliveryPartner.findUnique({ where: { userId: dto.userId } });
    if (existing) throw new ConflictException('User is already a delivery partner');
    try {
      return await this.prisma.deliveryPartner.create({
        data: {
          userId: dto.userId,
          vehicleType: dto.vehicleType?.trim(),
          vehicleNumber: dto.vehicleNumber?.trim(),
          status: DeliveryPartnerStatus.AVAILABLE,
          isAvailable: true,
        },
        include: { user: { select: safeUserSelect } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('User is already a delivery partner');
      }
      throw error;
    }
  }

  async list(admin: User, query: DeliveryPartnerQueryDto) {
    this.assertAdmin(admin);
    const where = query.status ? { status: query.status } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.deliveryPartner.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: safeUserSelect } },
      }),
      this.prisma.deliveryPartner.count({ where }),
    ]);
    return { data, page: query.page, limit: query.limit, total };
  }

  async updateStatus(user: User, id: string, dto: UpdateDeliveryPartnerStatusDto) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('Delivery partner not found');
    if (user.role !== UserRole.ADMIN && partner.userId !== user.id) {
      throw new ForbiddenException('You cannot update another delivery partner');
    }
    if (user.role !== UserRole.ADMIN && dto.status === DeliveryPartnerStatus.BUSY) {
      throw new ForbiddenException('Busy status is managed by delivery assignment');
    }
    const isAvailable = dto.status === DeliveryPartnerStatus.AVAILABLE;
    return this.prisma.deliveryPartner.update({
      where: { id },
      data: { status: dto.status, isAvailable },
      include: { user: { select: safeUserSelect } },
    });
  }

  async getByUser(userId: string) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { userId } });
    if (!partner) throw new NotFoundException('Delivery partner profile not found');
    return partner;
  }

  private assertAdmin(user: User) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can manage delivery partners');
    }
  }
}
