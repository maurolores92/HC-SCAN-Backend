import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Notification } from './notification.model';
import { NotificationPreference } from './models/notification-preference.model';
import {
  NOTIFICATION_REGISTRY,
  RecipientTargetRule,
} from './constants/notification-registry';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationRecipientsService } from './services/notification-recipients.service';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { PushNotificationsService } from './services/push-notifications.service';
import { Users } from '../users/users.model';

export interface NotifyPayload extends CreateNotificationDto {
  userId: number;
  companyId?: number | null;
}

export interface DispatchNotificationPayload {
  type: string;
  title?: string;
  body?: string;
  companyId?: number | null;
  targetUserId?: number | null;
  actorUser?: { id?: number | string | null } | null;
  excludeUserId?: number | null;
  extraData?: Record<string, any>;
  broadcastEvent?: string;
  broadcastPayload?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification)
    private readonly notificationModel: typeof Notification,
    private readonly gateway: NotificationsGateway,
    private readonly recipientsService: NotificationRecipientsService,
    private readonly preferencesService: NotificationPreferencesService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  async resolveRecipients(
    rules: RecipientTargetRule[],
    context: {
      targetUserId?: number | null;
      excludeUserId?: number | null;
      companyId?: number | null;
    },
  ): Promise<number[]> {
    return this.recipientsService.resolveRecipients(rules, context);
  }

  async isTypeEnabledForUser(userId: number, type: string): Promise<boolean> {
    return this.preferencesService.isTypeEnabledForUser(userId, type);
  }

  async dispatch(payload: DispatchNotificationPayload): Promise<void> {
    try {
      const def = NOTIFICATION_REGISTRY[payload.type];
      const rules: RecipientTargetRule[] = def
        ? def.defaultRecipients
        : ['superadmin'];

      const actorId = payload.actorUser?.id
        ? Number(payload.actorUser.id)
        : payload.excludeUserId
          ? Number(payload.excludeUserId)
          : null;

      const shouldExcludeActor =
        rules.includes('target_user') &&
        Number(payload.targetUserId) === Number(actorId)
          ? null
          : actorId;

      const targetUserIds = await this.resolveRecipients(rules, {
        targetUserId: payload.targetUserId ? Number(payload.targetUserId) : null,
        excludeUserId: shouldExcludeActor,
        companyId: payload.companyId ?? null,
      });

      if (targetUserIds.length === 0) {
        this.logger.log(
          `dispatch: No recipients resolved for notification '${payload.type}'`,
        );
      }

      const defaultTitle = def
        ? `${def.emoji} ${def.label}`
        : `Notificación del Sistema`;

      const finalTitle = payload.title || defaultTitle;
      const finalBody = payload.body || '';

      const notificationData: Record<string, any> = {
        companyId: payload.companyId,
        emoji: def?.emoji || '🔔',
        ...(payload.extraData || {}),
      };

      for (const targetId of targetUserIds) {
        const isEnabled = await this.isTypeEnabledForUser(
          targetId,
          payload.type,
        );
        if (!isEnabled) {
          this.logger.debug(
            `dispatch: '${payload.type}' is muted for user ${targetId}`,
          );
          continue;
        }

        try {
          const createdNotification = await this.notificationModel.create({
            companyId: payload.companyId ?? null,
            userId: targetId,
            type: payload.type,
            title: finalTitle,
            body: finalBody,
            data: notificationData,
            read: false,
            readAt: null,
          });

          this.gateway.emitToUser(targetId, createdNotification.toJSON());

          // Despacho Push nativo en segundo plano
          this.pushNotificationsService
            .sendToUser(targetId, {
              title: finalTitle,
              body: finalBody,
              data: {
                url: notificationData.link || '/',
                notificationId: createdNotification.id,
                type: payload.type,
              },
            })
            .catch((pushErr: unknown) => {
              const pMsg =
                pushErr instanceof Error ? pushErr.message : String(pushErr);
              this.logger.warn(
                `Push dispatch warning for user ${targetId}: ${pMsg}`,
              );
            });
        } catch (insertError) {
          const msg =
            insertError instanceof Error
              ? insertError.message
              : String(insertError);
          this.logger.error(
            `dispatch: Error inserting notification for user ${targetId}: ${msg}`,
          );
        }
      }

      if (payload.broadcastEvent) {
        this.gateway.broadcast(payload.broadcastEvent, {
          type: payload.type,
          title: finalTitle,
          body: finalBody,
          companyId: payload.companyId,
          timestamp: new Date().toISOString(),
          ...(payload.broadcastPayload || {}),
        });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `dispatch: Unexpected error dispatching notification '${payload?.type}': ${msg}`,
      );
    }
  }

  async notifyUser(payload: NotifyPayload): Promise<void> {
    try {
      const targetUserId = Number(payload.userId);
      if (!targetUserId || isNaN(targetUserId)) {
        this.logger.warn(
          `notifyUser: Invalid target userId '${payload.userId}'`,
        );
        return;
      }

      const isEnabled = await this.isTypeEnabledForUser(
        targetUserId,
        payload.type,
      );
      if (!isEnabled) {
        this.logger.debug(
          `notifyUser: '${payload.type}' disabled for user ${targetUserId}`,
        );
        return;
      }

      let companyId = payload.companyId;
      if (!companyId) {
        const u = await Users.findByPk(targetUserId, { attributes: ['companyId'] });
        companyId = u?.companyId ?? null;
      }

      const notification = await this.notificationModel.create({
        companyId: companyId ?? null,
        userId: targetUserId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? null,
        read: false,
        readAt: null,
      });

      this.gateway.emitToUser(targetUserId, notification.toJSON());

      this.pushNotificationsService
        .sendToUser(targetUserId, {
          title: payload.title,
          body: payload.body,
          data: {
            url: payload.data?.link || '/',
            notificationId: notification.id,
            type: payload.type,
          },
        })
        .catch((pushErr: unknown) => {
          const pMsg =
            pushErr instanceof Error ? pushErr.message : String(pushErr);
          this.logger.warn(
            `Push dispatch warning for user ${targetUserId}: ${pMsg}`,
          );
        });

      this.logger.log(
        `Notification sent to user ${targetUserId}: [${payload.type}] ${payload.title}`,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to notify user ${payload?.userId}: ${msg}`,
      );
    }
  }

  async notifyCompanyAdmins(
    companyId: number | null,
    payload: Omit<NotifyPayload, 'userId'>,
    options?: { excludeUserId?: number },
  ): Promise<void> {
    try {
      const targetIds = await this.resolveRecipients(
        ['company_admin', 'superadmin'],
        { excludeUserId: options?.excludeUserId, companyId },
      );

      this.logger.log(
        `notifyCompanyAdmins: Notificando '${payload.type}' a ${targetIds.length} usuarios: [${targetIds.join(', ')}]`,
      );
      for (const targetId of targetIds) {
        await this.notifyUser({ ...payload, userId: targetId, companyId });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to notify company admins: ${msg}`,
      );
    }
  }

  async notifyRole(
    roleSlug: string,
    payload: Omit<NotifyPayload, 'userId'>,
    companyId?: number,
  ): Promise<void> {
    try {
      const userIds = await this.recipientsService.resolveUserIdsByRoleSlug(
        roleSlug,
        companyId,
      );

      for (const targetId of userIds) {
        await this.notifyUser({ ...payload, userId: targetId, companyId });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to notify role ${roleSlug}: ${msg}`);
    }
  }

  broadcastEvent(event: string, data: any): void {
    try {
      this.gateway.broadcast(event, data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to broadcast event ${event}: ${msg}`);
    }
  }

  async findAll(
    userId: number,
    page = 0,
    pageSize = 20,
  ): Promise<{ data: Notification[]; total: number; unreadCount: number }> {
    const limit = pageSize;
    const offset = page * pageSize;

    const { rows, count } = await this.notificationModel.findAndCountAll({
      where: { userId },
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    const unreadCount = await this.notificationModel.count({
      where: { userId, read: false },
    });

    return { data: rows, total: count, unreadCount };
  }

  async getUnreadCount(userId: number): Promise<number> {
    return this.notificationModel.count({ where: { userId, read: false } });
  }

  async markAsRead(id: number, userId: number): Promise<void> {
    await this.notificationModel.update(
      { read: true, readAt: new Date() },
      { where: { id, userId } },
    );
  }

  async markAllAsRead(userId: number): Promise<void> {
    await this.notificationModel.update(
      { read: true, readAt: new Date() },
      { where: { userId, read: false } },
    );
  }

  async remove(id: number, userId: number): Promise<void> {
    await this.notificationModel.destroy({ where: { id, userId } });
  }

  async getPreferences(userId: number): Promise<NotificationPreference[]> {
    return this.preferencesService.getPreferences(userId);
  }

  async updatePreferences(
    userId: number,
    dto: UpdatePreferencesDto,
  ): Promise<NotificationPreference[]> {
    return this.preferencesService.updatePreferences(userId, dto);
  }
}
