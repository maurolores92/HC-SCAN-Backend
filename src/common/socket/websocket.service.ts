import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@Injectable()
export class WebsocketService {
  private server: Server;
  private clients: Map<string, Socket> = new Map();

  setServer(server: Server) {
    this.server = server;
  }

  registerClient(client: Socket) {
    this.clients.set(client.id, client);
  }

  unregisterClient(client: Socket) {
    this.clients.delete(client.id);
  }

  /** Emitir evento a todos */
  emitToAll(event: string, payload: any) {
    this.server.emit(event, payload);
  }

  /** Emitir evento a una sala (útil para chats) */
  emitToRoom(room: string, event: string, payload: any) {
    this.server.to(room).emit(event, payload);
  }

  /** Emitir a un cliente específico */
  emitToClient(clientId: string, event: string, payload: any) {
    const client = this.clients.get(clientId);
    if (client) client.emit(event, payload);
  }
}
