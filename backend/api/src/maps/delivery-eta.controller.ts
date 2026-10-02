import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryEtaService } from './delivery-eta.service';

type AuthenticatedRequest = Request & { user: User };

@Controller('api/deliveries')
@UseGuards(JwtAuthGuard)
export class DeliveryEtaController {
  constructor(private readonly etaService: DeliveryEtaService) {}

  /**
   * GET /api/deliveries/:id/eta
   * Returns real-time ETA from current GPS location to delivery destination.
   */
  @Get(':id/eta')
  getEta(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.etaService.getEta(req.user, id);
  }

  /**
   * GET /api/deliveries/:id/route
   * Returns a provider-independent live route using the latest persisted GPS
   * point and the delivery order's stored address coordinates.
   */
  @Get(':id/route')
  getRoute(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.etaService.getRoute(req.user, id);
  }
}
