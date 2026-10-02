import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sellingPrice: true,
          price: true,
          imageUrl: true,
          isActive: true,
          stockQuantity: true,
          vendor: { select: { id: true, businessName: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(user: User) {
    this.assertCustomer(user);
    const cart = await this.getOrCreateCart(user.id);
    return this.formatCart(cart);
  }

  async addItem(user: User, dto: AddCartItemDto) {
    this.assertCustomer(user);
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, isActive: true, stockQuantity: true, sellingPrice: true },
    });
    this.assertAvailableProduct(product);

    const cart = await this.getOrCreateCart(user.id);
    const existingItem = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
    });
    const nextQuantity = (existingItem?.quantity ?? 0) + dto.quantity;
    if (nextQuantity > product.stockQuantity) {
      throw new ConflictException('Requested quantity exceeds available stock');
    }

    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
      create: { cartId: cart.id, productId: dto.productId, quantity: dto.quantity, price: product.sellingPrice },
      update: { quantity: nextQuantity, price: product.sellingPrice },
    });
    return this.getCart(user);
  }

  async updateItem(user: User, itemId: string, dto: UpdateCartItemDto) {
    this.assertCustomer(user);
    const item = await this.findOwnedItem(user.id, itemId);
    const product = await this.prisma.product.findUnique({
      where: { id: item.productId },
      select: { id: true, isActive: true, stockQuantity: true, sellingPrice: true },
    });
    this.assertAvailableProduct(product);
    if (dto.quantity > product.stockQuantity) {
      throw new ConflictException('Requested quantity exceeds available stock');
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity, price: product.sellingPrice },
    });
    return this.getCart(user);
  }

  async removeItem(user: User, itemId: string) {
    this.assertCustomer(user);
    await this.findOwnedItem(user.id, itemId);
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCart(user);
  }

  async clearCart(user: User) {
    this.assertCustomer(user);
    const cart = await this.getOrCreateCart(user.id);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(user);
  }

  private async getOrCreateCart(userId: string) {
    const existingCart = await this.prisma.cart.findFirst({ where: { userId } });
    if (existingCart) {
      return this.prisma.cart.findUniqueOrThrow({ where: { id: existingCart.id }, include: cartInclude });
    }

    try {
      return await this.prisma.cart.create({ data: { userId }, include: cartInclude });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const cart = await this.prisma.cart.findFirst({ where: { userId } });
        if (cart) {
          return this.prisma.cart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude });
        }
      }
      throw error;
    }
  }

  private async findOwnedItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
    });
    if (!item) {
      throw new NotFoundException('Cart item not found');
    }
    return item;
  }

  private assertAvailableProduct(
    product: { id: string; isActive: boolean; stockQuantity: number; sellingPrice: Prisma.Decimal } | null,
  ) {
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found or inactive');
    }
    if (product.sellingPrice.lessThan(0)) {
      throw new ConflictException('Product price is invalid');
    }
  }

  private formatCart(cart: Prisma.CartGetPayload<{ include: typeof cartInclude }>) {
    let subtotal = new Prisma.Decimal(0);
    let itemCount = 0;
    const items = cart.items.map((item) => {
      const currentPrice = item.product.sellingPrice;
      const available = item.product.isActive && item.quantity <= item.product.stockQuantity;
      const itemSubtotal = available ? currentPrice.mul(item.quantity) : new Prisma.Decimal(0);
      if (available) {
        subtotal = subtotal.add(itemSubtotal);
        itemCount += item.quantity;
      }
      return {
        id: item.id,
        product: {
          id: item.product.id,
          name: item.product.name,
          price: currentPrice.toNumber(),
          imageUrl: item.product.imageUrl,
          vendor: item.product.vendor,
        },
        quantity: item.quantity,
        subtotal: itemSubtotal.toNumber(),
        available,
      };
    });

    return {
      id: cart.id,
      items,
      itemCount,
      subtotal: subtotal.toNumber(),
    };
  }

  private assertCustomer(user: User) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customers can use shopping carts');
    }
  }
}
