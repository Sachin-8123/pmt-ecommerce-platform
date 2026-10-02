import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto, StockAdjustmentType } from './dto/adjust-stock.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const productInclude = {
  vendor: {
    select: { id: true, businessName: true, email: true, phone: true, isActive: true },
  },
  category: true,
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: User, dto: CreateProductDto) {
    this.assertCanManage(user);
    const vendor = await this.requireVendor(dto.vendorId);
    if (user.role === UserRole.VENDOR && vendor.ownerId !== user.id) {
      throw new ForbiddenException('You can only create products for your own vendor');
    }
    await this.requireCategory(dto.categoryId);
    try {
      return await this.prisma.product.create({
        data: this.cleanProductData(dto) as Prisma.ProductUncheckedCreateInput,
        include: productInclude,
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async findMany(query: ListProductsDto, user?: User) {
    const where: Prisma.ProductWhereInput = {};
    const managedVendorIds = await this.getManagedVendorIds(user);
    if (!user || user.role === UserRole.CUSTOMER) {
      where.isActive = true;
    } else if (user.role !== UserRole.ADMIN) {
      where.vendorId = { in: managedVendorIds };
    } else if (query.active !== undefined) {
      where.isActive = query.active;
    }

    if (query.active !== undefined && user?.role === UserRole.ADMIN) {
      where.isActive = query.active;
    }
    if (query.search?.trim()) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }
    if (query.vendorId) {
      where.vendorId = this.restrictVendorFilter(query.vendorId, user, managedVendorIds);
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {
        ...(query.minPrice === undefined ? {} : { gte: query.minPrice }),
        ...(query.maxPrice === undefined ? {} : { lte: query.maxPrice }),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: productInclude,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { data, page: query.page, limit: query.limit, total };
  }

  async findOne(id: string, user?: User) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (!product.isActive && !(await this.canManageProduct(product.vendorId, user))) {
      throw new NotFoundException('Product not found');
    }
    if (user && user.role !== UserRole.ADMIN && user.role !== UserRole.CUSTOMER &&
      !(await this.isManagedVendor(product.vendorId, user))) {
      throw new ForbiddenException('You do not have access to this product');
    }
    return product;
  }

  async update(id: string, user: User, dto: UpdateProductDto) {
    const product = await this.requireProduct(id);
    await this.requireProductAccess(product.vendorId, user);
    if (dto.vendorId && dto.vendorId !== product.vendorId) {
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Only admins can change product ownership');
      }
      await this.requireVendor(dto.vendorId);
    }
    await this.requireCategory(dto.categoryId);
    try {
      return await this.prisma.product.update({
        where: { id },
        data: this.cleanProductData(dto) as Prisma.ProductUncheckedUpdateInput,
        include: productInclude,
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async remove(id: string, user: User) {
    const product = await this.requireProduct(id);
    await this.requireProductAccess(product.vendorId, user);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: productInclude,
    });
  }

  async adjustStock(id: string, user: User, dto: AdjustStockDto) {
    const product = await this.requireProduct(id);
    await this.requireProductAccess(product.vendorId, user);
    if (dto.type === StockAdjustmentType.DECREASE) {
      const result = await this.prisma.product.updateMany({
        where: { id, stockQuantity: { gte: dto.quantity } },
        data: { stockQuantity: { decrement: dto.quantity } },
      });
      if (result.count === 0) {
        throw new ConflictException('Stock cannot be reduced below zero');
      }
    } else {
      await this.prisma.product.update({
        where: { id },
        data: {
          stockQuantity:
            dto.type === StockAdjustmentType.INCREASE
              ? { increment: dto.quantity }
              : dto.quantity,
        },
      });
    }
    return this.findOne(id, user);
  }

  private async requireProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  private async requireVendor(id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    if (!vendor.isActive) {
      throw new ConflictException('Inactive vendors cannot receive products');
    }
    return vendor;
  }

  private async requireCategory(id?: string) {
    if (!id) {
      return;
    }
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    if (!category.isActive) {
      throw new ConflictException('Inactive categories cannot be assigned to products');
    }
  }

  private async requireProductAccess(vendorId: string, user: User) {
    if (user.role === UserRole.ADMIN) {
      return;
    }
    if (user.role !== UserRole.VENDOR || !(await this.isOwnedVendor(vendorId, user.id))) {
      throw new ForbiddenException('You do not manage this product');
    }
  }

  private async canManageProduct(vendorId: string, user?: User) {
    return !!user && (user.role === UserRole.ADMIN || await this.isManagedVendor(vendorId, user));
  }

  private async isManagedVendor(vendorId: string, user: User) {
    if (user.role === UserRole.ADMIN) {
      return true;
    }
    if (user.role === UserRole.VENDOR) {
      return this.isOwnedVendor(vendorId, user.id);
    }
    const staff = await this.prisma.vendorStaff.findFirst({ where: { vendorId, userId: user.id } });
    return !!staff;
  }

  private async isOwnedVendor(vendorId: string, userId: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId, ownerId: userId } });
    return !!vendor;
  }

  private async getManagedVendorIds(user?: User) {
    if (!user || user.role === UserRole.CUSTOMER) {
      return [];
    }
    if (user.role === UserRole.ADMIN) {
      return [];
    }
    if (user.role === UserRole.VENDOR) {
      const vendors = await this.prisma.vendor.findMany({ where: { ownerId: user.id }, select: { id: true } });
      return vendors.map((vendor) => vendor.id);
    }
    const staff = await this.prisma.vendorStaff.findMany({ where: { userId: user.id }, select: { vendorId: true } });
    return staff.map((entry) => entry.vendorId);
  }

  private restrictVendorFilter(vendorId: string, user: User | undefined, managedIds: string[]) {
    if (!user || user.role === UserRole.CUSTOMER) {
      return vendorId;
    }
    if (user.role === UserRole.ADMIN || managedIds.includes(vendorId)) {
      return vendorId;
    }
    return '__no_access__';
  }

  private assertCanManage(user: User) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.VENDOR) {
      throw new ForbiddenException('Only admins and shop owners can manage products');
    }
  }

  private cleanProductData(dto: CreateProductDto | UpdateProductDto) {
    return Object.fromEntries(
      Object.entries(dto)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
    );
  }

  private handleKnownError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('SKU or barcode is already in use');
    }
  }
}
