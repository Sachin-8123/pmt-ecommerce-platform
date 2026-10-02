import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: User, dto: CreateCategoryDto) {
    this.assertAdmin(user);
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim(),
        },
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async findMany(user?: User) {
    const where: Prisma.CategoryWhereInput =
      user?.role === UserRole.ADMIN ? {} : { isActive: true };
    return this.prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, user?: User) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category || (!category.isActive && user?.role !== UserRole.ADMIN)) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async update(id: string, user: User, dto: UpdateCategoryDto) {
    this.assertAdmin(user);
    await this.requireCategory(id);
    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.description === undefined ? {} : { description: dto.description.trim() }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async remove(id: string, user: User) {
    this.assertAdmin(user);
    await this.requireCategory(id);
    const productCount = await this.prisma.product.count({ where: { categoryId: id } });
    if (productCount > 0) {
      throw new ConflictException('Category cannot be deleted while products use it');
    }
    return this.prisma.category.delete({ where: { id } });
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  private assertAdmin(user: User) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can manage categories');
    }
  }

  private handleKnownError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Category name is already in use');
    }
  }
}
