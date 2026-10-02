import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { PaymentWebhookDto } from './dto/webhook.dto';
import { PaymentsService } from './payments.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentsService.create(request.user, dto, idempotencyKey);
  }

  @Post('retry')
  @UseGuards(JwtAuthGuard)
  retry(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentsService.retry(request.user, dto, idempotencyKey);
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  verify(@Req() request: AuthenticatedRequest, @Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verify(request.user, dto);
  }

  @Post('webhook')
  webhook(@Body() dto: PaymentWebhookDto, @Headers('x-payment-signature') signature?: string) {
    return this.paymentsService.webhook(dto, signature || '');
  }

  @Get(':orderId/status')
  @UseGuards(JwtAuthGuard)
  status(@Req() request: AuthenticatedRequest, @Param('orderId') orderId: string) {
    return this.paymentsService.status(request.user, orderId);
  }

  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  history(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Query() query: PaymentQueryDto,
  ) {
    return this.paymentsService.history(request.user, orderId, query);
  }
}
