import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { PaymentsService } from './payments.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('api/admin/payments')
@UseGuards(JwtAuthGuard)
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('order/:orderId')
  history(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentsService.history(request.user, orderId, query);
  }
}
