import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrdersService } from './orders.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('api/checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('preview')
  preview(@Req() request: AuthenticatedRequest) {
    return this.ordersService.preview(request.user);
  }
}
