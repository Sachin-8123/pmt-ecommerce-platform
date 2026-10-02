import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDeliveryPartnerDto } from './dto/create-delivery-partner.dto';
import { DeliveryPartnerQueryDto } from './dto/delivery-partner-query.dto';
import { UpdateDeliveryPartnerStatusDto } from './dto/update-delivery-partner-status.dto';
import { DeliveryPartnersService } from './delivery-partners.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('api/delivery-partners')
@UseGuards(JwtAuthGuard)
export class DeliveryPartnersController {
  constructor(private readonly service: DeliveryPartnersService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateDeliveryPartnerDto) {
    return this.service.create(request.user, dto);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: DeliveryPartnerQueryDto) {
    return this.service.list(request.user, query);
  }

  @Patch(':id/status')
  updateStatus(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateDeliveryPartnerStatusDto) {
    return this.service.updateStatus(request.user, id, dto);
  }
}
