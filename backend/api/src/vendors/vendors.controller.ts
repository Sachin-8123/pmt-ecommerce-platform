import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddVendorStaffDto } from './dto/add-vendor-staff.dto';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { ListVendorsDto } from './dto/list-vendors.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorsService } from './vendors.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('api/vendors')
@UseGuards(JwtAuthGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateVendorDto) {
    return this.vendorsService.create(request.user, dto);
  }

  @Get()
  list(@Query() query: ListVendorsDto) {
    return this.vendorsService.findMany(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorsService.update(id, request.user, dto);
  }

  @Post(':vendorId/staff')
  addStaff(
    @Param('vendorId') vendorId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: AddVendorStaffDto,
  ) {
    return this.vendorsService.addStaff(vendorId, request.user, dto);
  }

  @Get(':vendorId/staff')
  listStaff(@Param('vendorId') vendorId: string) {
    return this.vendorsService.listStaff(vendorId);
  }

  @Delete(':vendorId/staff/:staffId')
  removeStaff(
    @Param('vendorId') vendorId: string,
    @Param('staffId') staffId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vendorsService.removeStaff(vendorId, staffId, request.user);
  }
}
