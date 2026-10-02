import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MapsService } from './maps.service';
import { GeocodeDto } from './dto/geocode.dto';
import { ReverseGeocodeDto } from './dto/reverse-geocode.dto';
import { CoordinatePairDto } from './dto/coordinate-pair.dto';

@Controller('api/maps')
@UseGuards(JwtAuthGuard)
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  /**
   * POST /api/maps/geocode
   * Convert a text address into latitude/longitude.
   */
  @Post('geocode')
  async geocode(@Body() dto: GeocodeDto) {
    const address = dto.address.trim();
    if (!address) throw new BadRequestException('Address must not be empty');
    return this.mapsService.geocode(address);
  }

  /**
   * GET /api/maps/reverse-geocode?latitude=...&longitude=...
   * Convert coordinates into a readable address.
   */
  @Get('reverse-geocode')
  reverseGeocode(@Query() dto: ReverseGeocodeDto) {
    return this.mapsService.reverseGeocode(dto.latitude, dto.longitude);
  }

  /**
   * GET /api/maps/distance?originLatitude=...&originLongitude=...&destinationLatitude=...&destinationLongitude=...
   * Calculate straight-line distance between two coordinate pairs.
   */
  @Get('distance')
  distance(@Query() dto: CoordinatePairDto) {
    return this.mapsService.calculateDistance(
      dto.originLatitude,
      dto.originLongitude,
      dto.destinationLatitude,
      dto.destinationLongitude,
    );
  }

  /**
   * GET /api/maps/route?originLatitude=...&originLongitude=...&destinationLatitude=...&destinationLongitude=...
   * Calculate route distance and estimated duration.
   */
  @Get('route')
  route(@Query() dto: CoordinatePairDto) {
    return this.mapsService.calculateRoute(
      dto.originLatitude,
      dto.originLongitude,
      dto.destinationLatitude,
      dto.destinationLongitude,
    );
  }
}
