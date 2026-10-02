import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { CompleteDeliveryDto } from './dto/complete-delivery.dto';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryFailureDto } from './dto/delivery-failure.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { LocationQueryDto } from './dto/location-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { DeliveriesService } from './deliveries.service';
import { TrackingService } from './tracking.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('api/deliveries')
@UseGuards(JwtAuthGuard)
export class DeliveriesController {
  constructor(
    private readonly service: DeliveriesService,
    private readonly trackingService: TrackingService,
  ) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateDeliveryDto) {
    return this.service.create(request.user, dto);
  }

  @Get(':id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getDetails(request.user, id);
  }

  @Patch(':id/status')
  updateStatus(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateDeliveryStatusDto) {
    return this.service.updateStatus(request.user, id, dto);
  }

  @Patch(':id/assign')
  assign(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: AssignDeliveryDto) {
    return this.service.assign(request.user, id, dto);
  }

  @Patch(':id/pickup')
  pickup(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.pickup(request.user, id);
  }

  @Patch(':id/out-for-delivery')
  outForDelivery(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.outForDelivery(request.user, id);
  }

  @Patch(':id/complete')
  complete(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: CompleteDeliveryDto) {
    return this.service.complete(request.user, id, dto);
  }

  @Patch(':id/fail')
  fail(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: DeliveryFailureDto) {
    return this.service.fail(request.user, id, dto);
  }

  @Post(':id/location')
  updateLocation(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.trackingService.update(request.user, id, dto);
  }

  @Get(':id/location')
  latestLocation(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.trackingService.latest(request.user, id);
  }

  @Get(':id/locations')
  locationHistory(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Query() query: LocationQueryDto) {
    return this.trackingService.history(request.user, id, query);
  }

  @Get(':id/tracking')
  tracking(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.trackingService.tracking(request.user, id);
  }
}
