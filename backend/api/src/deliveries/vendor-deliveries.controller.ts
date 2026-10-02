import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryQueryDto } from './dto/delivery-query.dto';
import { DeliveriesService } from './deliveries.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('api/vendor/deliveries')
@UseGuards(JwtAuthGuard)
export class VendorDeliveriesController {
  constructor(private readonly service: DeliveriesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: DeliveryQueryDto) {
    return this.service.vendorDeliveries(request.user, query);
  }
}
