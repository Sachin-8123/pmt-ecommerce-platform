import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

type AuthenticatedRequest = Request & { user: User };
type OptionalAuthRequest = Request & { user?: User };

@Controller('api/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateProductDto) {
    return this.productsService.create(request.user, dto);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(@Query() query: ListProductsDto, @Req() request: OptionalAuthRequest) {
    return this.productsService.findMany(query, request.user);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param('id') id: string, @Req() request: OptionalAuthRequest) {
    return this.productsService.findOne(id, request.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, request.user, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.productsService.remove(id, request.user);
  }

  @Patch(':id/stock')
  @UseGuards(JwtAuthGuard)
  adjustStock(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: AdjustStockDto,
  ) {
    return this.productsService.adjustStock(id, request.user, dto);
  }
}
