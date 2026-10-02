import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveriesService } from './deliveries.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('api/orders')
@UseGuards(JwtAuthGuard)
export class OrderDeliveryController {
  constructor(private readonly service: DeliveriesService) {}

  @Get(':orderId/delivery')
  get(@Req() request: AuthenticatedRequest, @Param('orderId') orderId: string) {
    return this.service.customerDelivery(request.user, orderId);
  }
}
