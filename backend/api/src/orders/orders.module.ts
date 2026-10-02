import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module';
import { AdminOrdersController } from './admin-orders.controller';
import { CheckoutController } from './checkout.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { VendorOrdersController } from './vendor-orders.controller';

@Module({
  imports: [AddressesModule],
  controllers: [
    CheckoutController,
    OrdersController,
    VendorOrdersController,
    AdminOrdersController,
  ],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
