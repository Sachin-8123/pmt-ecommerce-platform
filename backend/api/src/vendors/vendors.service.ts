import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddVendorStaffDto } from './dto/add-vendor-staff.dto';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { ListVendorsDto } from './dto/list-vendors.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: User, dto: CreateVendorDto) {
    this.assertCanCreate(user);
    await this.ensureUniqueContact(dto.email, dto.phone);
    try {
      return await this.prisma.vendor.create({
        data: {
          ...this.cleanVendorData(dto),
          businessName: dto.businessName.trim(),
          ownerId: user.id,
        } as Prisma.VendorUncheckedCreateInput,
        include: { owner: { select: safeUserSelect } },
      });
    } catch (error) {
      this.handleKnownConflict(error);
      throw error;
    }
  }

  async findOne(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: { owner: { select: safeUserSelect } },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    return vendor;
  }

  async update(id: string, user: User, dto: UpdateVendorDto) {
    await this.requireVendorAccess(id, user);
    await this.ensureUniqueContact(dto.email, dto.phone, id);
    try {
      return await this.prisma.vendor.update({
        where: { id },
        data: this.cleanVendorData(dto),
        include: { owner: { select: safeUserSelect } },
      });
    } catch (error) {
      this.handleKnownConflict(error);
      throw error;
    }
  }

  async findMany(query: ListVendorsDto) {
    const where: Prisma.VendorWhereInput = {};
    const search = query.search?.trim();
    if (search) {
      where.businessName = { contains: search, mode: 'insensitive' };
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.vendor.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { owner: { select: safeUserSelect } },
      }),
      this.prisma.vendor.count({ where }),
    ]);
    return { data, page: query.page, limit: query.limit, total };
  }

  async addStaff(vendorId: string, user: User, dto: AddVendorStaffDto) {
    await this.requireVendorAccess(vendorId, user);
    const staffUser = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!staffUser) {
      throw new NotFoundException('User not found');
    }
    if (!staffUser.isActive) {
      throw new ConflictException('Inactive users cannot be added as vendor staff');
    }
    const existingStaff = await this.prisma.vendorStaff.findFirst({
      where: { vendorId, userId: dto.userId },
    });
    if (existingStaff) {
      throw new ConflictException('User is already vendor staff');
    }

    return this.prisma.vendorStaff.create({
      data: { vendorId, userId: dto.userId, role: dto.role },
      include: { user: { select: safeUserSelect } },
    });
  }

  async listStaff(vendorId: string) {
    await this.requireVendor(vendorId);
    return this.prisma.vendorStaff.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: safeUserSelect } },
    });
  }

  async removeStaff(vendorId: string, staffId: string, user: User) {
    await this.requireVendorAccess(vendorId, user);
    const staff = await this.prisma.vendorStaff.findFirst({ where: { id: staffId, vendorId } });
    if (!staff) {
      throw new NotFoundException('Vendor staff member not found');
    }
    return this.prisma.vendorStaff.delete({ where: { id: staffId } });
  }

  private async requireVendorAccess(vendorId: string, user: User) {
    const vendor = await this.requireVendor(vendorId);
    if (user.role !== UserRole.ADMIN && vendor.ownerId !== user.id) {
      throw new ForbiddenException('You do not manage this vendor');
    }
    return vendor;
  }

  private async requireVendor(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    return vendor;
  }

  private assertCanCreate(user: User) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.VENDOR) {
      throw new ForbiddenException('Only admins and shop owners can create vendors');
    }
  }

  private async ensureUniqueContact(email?: string, phone?: string, excludeId?: string) {
    const where: Prisma.VendorWhereInput = {
      OR: [
        ...(email ? [{ email: email.trim().toLowerCase() }] : []),
        ...(phone ? [{ phone: phone.trim() }] : []),
      ],
    };
    if (!where.OR?.length) {
      return;
    }
    if (excludeId) {
      where.NOT = { id: excludeId };
    }
    const existingVendor = await this.prisma.vendor.findFirst({ where });
    if (existingVendor) {
      throw new ConflictException('Vendor email or phone is already registered');
    }
  }

  private cleanVendorData(dto: CreateVendorDto | UpdateVendorDto): Prisma.VendorUpdateInput {
    return Object.fromEntries(
      Object.entries(dto)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [
          key,
          typeof value === 'string'
            ? key === 'email'
              ? value.trim().toLowerCase()
              : value.trim()
            : value,
        ]),
    ) as Prisma.VendorUpdateInput;
  }

  private handleKnownConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Vendor email or phone is already registered');
    }
  }
}
