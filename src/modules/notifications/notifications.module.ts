import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { JwtModule } from '@nestjs/jwt';
import { Notification } from './notification.model';
import { NotificationPreference } from './models/notification-preference.model';
import { PushSubscription } from './push-subscription.model';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsController } from './notifications.controller';
import { NotificationRecipientsService } from './services/notification-recipients.service';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { PushNotificationsService } from './services/push-notifications.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Notification,
      NotificationPreference,
      PushSubscription,
    ]),
    JwtModule, // Necesario para que el gateway pueda verificar tokens
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationRecipientsService,
    NotificationPreferencesService,
    PushNotificationsService,
  ],
  exports: [
    NotificationsService,
    NotificationRecipientsService,
    NotificationPreferencesService,
    PushNotificationsService,
  ], // Exportar para que otros módulos lo usen
})
export class NotificationsModule {}
