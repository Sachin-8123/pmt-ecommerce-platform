import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderQueryDto } from './dto/order-query.dto';
import { OrdersService } from './orders.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('api/vendor/orders')
@UseGuards(JwtAuthGuard)
export class VendorOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: OrderQueryDto) {
    return this.ordersService.findVendorOrders(request.user, query);
  }
}
