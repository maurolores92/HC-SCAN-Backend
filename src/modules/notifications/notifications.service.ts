import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
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
import { isPlatformSuperAdmin } from '../../common/utils/tenant-scope.util';

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

      const finalTitle =
        payload.title ||
        (def ? `${def.emoji} ${def.label}` : 'Notificación del Sistema');
      const finalBody = payload.body || '';
      const notificationData: Record<string, any> = {
        companyId: payload.companyId,
        emoji: def?.emoji || '🔔',
        ...(payload.extraData || {}),
      };

      for (const targetId of targetUserIds) {
        const isEnabled = await this.isTypeEnabledForUser(targetId, payload.type);
        if (!isEnabled) continue;

        try {
          const targetRecord = await Users.findByPk(targetId, {
            attributes: ['id', 'companyId', 'username'],
          });
          const notificationCompanyId =
            targetRecord?.username?.toLowerCase() === 'superadmin'
              ? null
              : payload.companyId ?? targetRecord?.companyId ?? null;

          const createdNotification = await this.notificationModel.create({
            companyId: notificationCompanyId,
            userId: targetId,
            type: payload.type,
            title: finalTitle,
            body: finalBody,
            data: notificationData,
            read: false,
            readAt: null,
          });

          this.gateway.emitToUser(targetId, createdNotification.toJSON());

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
              const pMsg = pushErr instanceof Error ? pushErr.message : String(pushErr);
              this.logger.warn(`Push dispatch warning for user ${targetId}: ${pMsg}`);
            });
        } catch (insertError: unknown) {
          const msg = insertError instanceof Error ? insertError.message : String(insertError);
          this.logger.error(`dispatch: Error inserting notification for user ${targetId}: ${msg}`);
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
      this.logger.error(`dispatch: Error dispatching '${payload?.type}': ${msg}`);
    }
  }

  async notifyUser(payload: NotifyPayload): Promise<void> {
    try {
      const targetUserId = Number(payload.userId);
      if (!targetUserId || isNaN(targetUserId)) return;

      const isEnabled = await this.isTypeEnabledForUser(targetUserId, payload.type);
      if (!isEnabled) return;

      const u = await Users.findByPk(targetUserId, { attributes: ['companyId', 'username'] });
      const resolvedCompanyId =
        u?.username?.toLowerCase() === 'superadmin'
          ? null
          : payload.companyId ?? u?.companyId ?? null;

      const notification = await this.notificationModel.create({
        companyId: resolvedCompanyId,
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
        .catch(() => {});
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to notify user ${payload?.userId}: ${msg}`);
    }
  }

  async notifyCompanyAdmins(
    companyId: number | null,
    payload: Omit<NotifyPayload, 'userId'>,
    options?: { excludeUserId?: number },
  ): Promise<void> {
    if (!companyId) return;
    const targetIds = await this.resolveRecipients(['company_admin'], {
      excludeUserId: options?.excludeUserId,
      companyId,
    });
    for (const targetId of targetIds) {
      await this.notifyUser({ ...payload, userId: targetId, companyId });
    }
  }

  async notifyRole(
    roleSlug: string,
    payload: Omit<NotifyPayload, 'userId'>,
    companyId?: number,
  ): Promise<void> {
    const userIds = await this.recipientsService.resolveUserIdsByRoleSlug(roleSlug, companyId);
    for (const targetId of userIds) {
      await this.notifyUser({ ...payload, userId: targetId, companyId });
    }
  }

  private buildInboxWhere(userId: number, actorUser?: any): Record<string, any> {
    const where: Record<string, any> = { userId };

    if (actorUser && !isPlatformSuperAdmin(actorUser) && actorUser.companyId) {
      where[Op.or as any] = [{ companyId: actorUser.companyId }, { companyId: null }];
      where.type = { [Op.ne]: 'system.company_created' };
    }

    return where;
  }

  async findAll(
    userId: number,
    page = 0,
    pageSize = 20,
    actorUser?: any,
  ): Promise<{ data: Notification[]; total: number; unreadCount: number }> {
    const where = this.buildInboxWhere(userId, actorUser);

    const { rows, count } = await this.notificationModel.findAndCountAll({
      where,
      limit: pageSize,
      offset: page * pageSize,
      order: [['createdAt', 'DESC']],
    });

    const unreadCount = await this.notificationModel.count({
      where: { ...where, read: false },
    });

    return { data: rows, total: count, unreadCount };
  }

  async getUnreadCount(userId: number, actorUser?: any): Promise<number> {
    const where = this.buildInboxWhere(userId, actorUser);
    return this.notificationModel.count({ where: { ...where, read: false } });
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
