import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { resolveJwtSecret } from '../../config/env-resolver';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  /** Valida el JWT del handshake y une al usuario a su room personal y de compañía */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: resolveJwtSecret(),
      });

      const userId: number = Number(payload.id || payload.sub);
      if (!userId || isNaN(userId)) {
        this.logger.warn(
          `Client ${client.id} token missing valid userId: ${JSON.stringify(payload)}`,
        );
        client.disconnect();
        return;
      }

      // Room personal del usuario
      const userRoom = `user-${userId}`;
      client.join(userRoom);
      client.data.userId = userId;

      // Room de compañía si aplica
      if (payload.companyId) {
        const companyRoom = `company-${payload.companyId}`;
        client.join(companyRoom);
        client.data.companyId = payload.companyId;
      }

      this.logger.log(`User ${userId} connected → room ${userRoom}`);
    } catch (error: any) {
      this.logger.warn(
        `Invalid token (${error?.message}) — disconnecting client ${client.id}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /** Emite una notificación al room del usuario */
  emitToUser(userId: number, notification: any): void {
    if (!this.server) {
      this.logger.warn(
        `emitToUser: server not ready to emit to user-${userId}`,
      );
      return;
    }
    this.server.to(`user-${userId}`).emit('notification', notification);
  }

  /** Emite una notificación a toda una compañía */
  emitToCompany(companyId: number, event: string, data: any): void {
    if (!this.server) {
      this.logger.warn(`emitToCompany: server not ready to emit ${event}`);
      return;
    }
    this.server.to(`company-${companyId}`).emit(event, data);
  }

  /** Emite un evento a todos los clientes conectados en el namespace */
  broadcast(event: string, data: any): void {
    if (!this.server) {
      this.logger.warn(`broadcast: server not ready to emit ${event}`);
      return;
    }
    this.server.emit(event, data);
  }

  @SubscribeMessage('notification:read')
  handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { id: number },
  ) {
    this.logger.log(`User ${client.data.userId} read notification ${data.id}`);
  }
}
