import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WebsocketService } from './websocket.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/realtime',
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  constructor(private readonly websocketService: WebsocketService) {}

  handleConnection(client: Socket) {
    // console.log(`🟢 Cliente conectado: ${client.id}`);
    this.websocketService.registerClient(client);
  }

  handleDisconnect(client: Socket) {
    console.log(`🔴 Cliente desconectado: ${client.id}`);
    this.websocketService.unregisterClient(client);
  }

  // Ejemplo: evento genérico recibido
  @SubscribeMessage('join_room')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const { room } = data;
    client.join(room);
    console.log(`Cliente ${client.id} se unió a la sala ${room}`);
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const { room } = data;
    client.leave(room);
    console.log(`Cliente ${client.id} salió de la sala ${room}`);
  }

  // 🔥 Puedes definir handlers para mensajes genéricos si querés
  @SubscribeMessage('broadcast')
  handleBroadcast(@MessageBody() data: any) {
    this.server.emit('broadcast_message', data);
  }
}
