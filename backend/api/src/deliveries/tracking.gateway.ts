import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingService } from './tracking.service';
import { JoinDeliveryDto, LeaveDeliveryDto, SocketLocationUpdateDto } from './dto/update-location.dto';

@WebSocketGateway({ namespace: '/tracking', cors: { origin: true, credentials: true } })
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class TrackingGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly trackingService: TrackingService,
  ) {}

  afterInit() {
    this.trackingService.locationUpdates$.subscribe((location) => {
      if (this.server) {
        this.server.to(this.room(location.deliveryId)).emit('delivery.location.updated', location);
      }
    });
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      const payload = this.jwtService.verify<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new Error('Invalid socket user');
      client.data.user = user;
    } catch {
      client.emit('tracking.error', { message: 'Unauthorized tracking socket' });
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {
    // Socket.io cleanly removes sockets from all rooms on disconnect
  }

  @SubscribeMessage('delivery.join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: JoinDeliveryDto) {
    if (!client.data.user) {
      return { ok: false, error: 'Unauthorized tracking socket' };
    }
    if (!body?.deliveryId || typeof body.deliveryId !== 'string') {
      return { ok: false, error: 'deliveryId is required' };
    }
    const allowed = await this.trackingService.canView(client.data.user, body.deliveryId);
    if (!allowed) {
      return { ok: false, error: 'Delivery access denied' };
    }
    await client.join(this.room(body.deliveryId));
    return { ok: true, deliveryId: body.deliveryId };
  }

  @SubscribeMessage('delivery.leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody() body: LeaveDeliveryDto) {
    if (!client.data.user) {
      return { ok: false, error: 'Unauthorized tracking socket' };
    }
    if (!body?.deliveryId || typeof body.deliveryId !== 'string') {
      return { ok: false, error: 'deliveryId is required' };
    }
    const allowed = await this.trackingService.canView(client.data.user, body.deliveryId);
    if (!allowed) {
      return { ok: false, error: 'Delivery access denied' };
    }
    await client.leave(this.room(body.deliveryId));
    return { ok: true, deliveryId: body.deliveryId };
  }

  @SubscribeMessage('delivery.location.update')
  async updateLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SocketLocationUpdateDto,
  ) {
    if (!client.data.user) {
      return { ok: false, error: 'Unauthorized tracking socket' };
    }
    if (!body?.deliveryId) {
      return { ok: false, error: 'deliveryId is required' };
    }
    try {
      const location = await this.trackingService.update(client.data.user, body.deliveryId, body);
      return { ok: true, location };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Location update rejected';
      return { ok: false, error: message };
    }
  }

  private extractToken(client: Socket) {
    const authorization = client.handshake.headers?.authorization;
    const authHeader =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : undefined;
    const token =
      client.handshake.auth?.token ||
      authHeader ||
      (typeof client.handshake.query?.token === 'string' ? client.handshake.query.token : undefined);
    if (!token || typeof token !== 'string') throw new Error('Missing socket token');
    return token;
  }

  private room(deliveryId: string) {
    return `delivery:${deliveryId}`;
  }
}

