import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';
import { DeliveryEtaController } from './delivery-eta.controller';
import { DeliveryEtaService } from './delivery-eta.service';

@Module({
  imports: [AuthModule, DeliveriesModule],
  controllers: [MapsController, DeliveryEtaController],
  providers: [MapsService, DeliveryEtaService],
  exports: [MapsService],
})
export class MapsModule {}
