import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveryPartnersModule } from '../delivery-partners/delivery-partners.module';
import { AdminDeliveriesController } from './admin-deliveries.controller';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';
import { OrderDeliveryController } from './order-delivery.controller';
import { PartnerDeliveriesController } from './partner-deliveries.controller';
import { VendorDeliveriesController } from './vendor-deliveries.controller';

@Module({
  imports: [DeliveryPartnersModule, AuthModule],
  controllers: [DeliveriesController, AdminDeliveriesController, VendorDeliveriesController, PartnerDeliveriesController, OrderDeliveryController],
  providers: [DeliveriesService, TrackingService, TrackingGateway],
  // TrackingService is reused by the maps ETA facade so authorization remains
  // centralized in the existing delivery tracking rules.
  exports: [DeliveriesService, TrackingService],
})
export class DeliveriesModule {}
