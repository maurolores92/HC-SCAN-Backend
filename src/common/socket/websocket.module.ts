import { Global, Module, OnModuleInit } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { WebsocketService } from './websocket.service';

@Module({
  providers: [WebsocketGateway, WebsocketService],
  exports: [WebsocketService],
})
export class WebsocketModule implements OnModuleInit {
  constructor(
    private readonly gateway: WebsocketGateway,
    private readonly service: WebsocketService,
  ) {}

  onModuleInit() {
    // Vincula el server al servicio al iniciar
    this.service.setServer(this.gateway.server);
  }
}
