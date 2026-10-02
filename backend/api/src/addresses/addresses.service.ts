import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  findMany(user: User) {
    this.assertCustomer(user);
    return this.prisma.address.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(user: User, id: string) {
    this.assertCustomer(user);
    const address = await this.prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }

  create(user: User, dto: CreateAddressDto) {
    this.assertCustomer(user);
    return this.prisma.address.create({
      data: { ...this.clean(dto), userId: user.id } as Prisma.AddressUncheckedCreateInput,
    });
  }

  async update(user: User, id: string, dto: UpdateAddressDto) {
    this.assertCustomer(user);
    await this.findOne(user, id);
    return this.prisma.address.update({ where: { id }, data: this.clean(dto) });
  }

  async remove(user: User, id: string) {
    this.assertCustomer(user);
    await this.findOne(user, id);
    return this.prisma.address.delete({ where: { id } });
  }

  private clean(dto: CreateAddressDto | UpdateAddressDto) {
    return Object.fromEntries(
      Object.entries(dto)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
    );
  }

  private assertCustomer(user: User) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customers can manage addresses');
    }
  }
}
