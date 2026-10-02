import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AddressesModule } from './addresses/addresses.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { DeliveryPartnersModule } from './delivery-partners/delivery-partners.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { HealthModule } from './health/health.module';
import { MapsModule } from './maps/maps.module';
import { ProductsModule } from './products/products.module';
import { PrismaModule } from './prisma/prisma.module';
import { VendorsModule } from './vendors/vendors.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [PrismaModule, AuthModule, AddressesModule, VendorsModule, CategoriesModule, ProductsModule, CartModule, OrdersModule, PaymentsModule, DeliveryPartnersModule, DeliveriesModule, MapsModule, HealthModule],
})
export class AppModule {}

