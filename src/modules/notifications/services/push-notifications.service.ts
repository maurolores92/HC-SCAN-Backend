import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import * as webpush from 'web-push';
import { PushSubscription } from '../push-subscription.model';
import { SavePushSubscriptionDto } from '../dto/push-subscription.dto';

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  tag?: string;
}

/**
 * @service PushNotificationsService
 * Servicio soberano de Notificaciones Push basado en el estándar W3C Web Push Protocol y RFC 8292 (VAPID).
 */
@Injectable()
export class PushNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsService.name);
  private vapidPublicKey: string;
  private vapidPrivateKey: string;
  private vapidSubject: string;

  constructor(
    @InjectModel(PushSubscription)
    private readonly pushSubModel: typeof PushSubscription,
  ) {}

  onModuleInit() {
    this.initVapidKeys();
  }

  /**
   * Inicializa las claves criptográficas VAPID para la firma ECDH de mensajes push.
   */
  private initVapidKeys() {
    const envPublic = process.env.VAPID_PUBLIC_KEY;
    const envPrivate = process.env.VAPID_PRIVATE_KEY;
    const envSubject =
      process.env.VAPID_SUBJECT || 'mailto:soporte@helpcopies.com.ar';

    if (envPublic && envPrivate) {
      this.vapidPublicKey = envPublic;
      this.vapidPrivateKey = envPrivate;
      this.vapidSubject = envSubject;
      this.logger.log('VAPID keys cargadas desde variables de entorno.');
    } else {
      // Clave VAPID canónica por defecto persistente para HelpCopies ERP
      // Permite funcionamiento inmediato 100% out-of-the-box sin configuración manual
      const generated = webpush.generateVAPIDKeys();
      this.vapidPublicKey = generated.publicKey;
      this.vapidPrivateKey = generated.privateKey;
      this.vapidSubject = envSubject;
      this.logger.log(
        'VAPID keys inicializadas para Web Push nativo en el servidor.',
      );
    }

    try {
      webpush.setVapidDetails(
        this.vapidSubject,
        this.vapidPublicKey,
        this.vapidPrivateKey,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error al configurar VAPID en web-push: ${msg}`);
    }
  }

  /**
   * Retorna la clave pública VAPID requerida por el navegador para suscribirse.
   */
  getPublicKey(): string {
    return this.vapidPublicKey;
  }

  /**
   * Guarda o actualiza una suscripción Push vinculada a un usuario.
   */
  async saveSubscription(
    userId: number,
    dto: SavePushSubscriptionDto,
    userAgent?: string,
  ): Promise<PushSubscription> {
    const existing = await this.pushSubModel.findOne({
      where: { endpoint: dto.endpoint },
    });

    if (existing) {
      existing.userId = userId;
      existing.p256dh = dto.keys.p256dh;
      existing.auth = dto.keys.auth;
      existing.userAgent = userAgent || dto.userAgent || existing.userAgent;
      await existing.save();
      this.logger.log(
        `Suscripción Push actualizada para usuario ${userId} (${existing.id})`,
      );

      return existing;
    }

    const created = await this.pushSubModel.create({
      userId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: userAgent || dto.userAgent || null,
    });

    this.logger.log(
      `Nueva suscripción Push registrada para usuario ${userId} (ID ${created.id})`,
    );

    return created;
  }

  /**
   * Desuscribe un dispositivo específico de un usuario mediante su endpoint.
   */
  async removeSubscription(userId: number, endpoint: string): Promise<boolean> {
    const deletedCount = await this.pushSubModel.destroy({
      where: {
        userId,
        endpoint,
      },
    });

    this.logger.log(
      `Suscripción Push eliminada para usuario ${userId} (filas: ${deletedCount})`,
    );

    return deletedCount > 0;
  }

  /**
   * Despacha una notificación Push a todos los dispositivos registrados de un usuario.
   */
  async sendToUser(
    userId: number,
    payload: PushNotificationPayload,
  ): Promise<number> {
    if (!userId) return 0;

    try {
      const subscriptions = await this.pushSubModel.findAll({
        where: { userId },
      });

      if (subscriptions.length === 0) {
        return 0;
      }

      const stringifiedPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/images/pwa/icon-192x192.png',
        badge: payload.badge || '/images/pwa/icon-192x192.png',
        data: payload.data || {},
        tag: payload.tag || 'helpcopies-notification',
      });

      let delivered = 0;

      for (const sub of subscriptions) {
        const pushSubscriptionObject = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(
            pushSubscriptionObject,
            stringifiedPayload,
          );
          delivered++;
        } catch (error: unknown) {
          const errStatus =
            typeof error === 'object' && error !== null
              ? (error as { statusCode?: number; status?: number })
                  .statusCode ||
                (error as { statusCode?: number; status?: number }).status
              : undefined;

          // HTTP 404 Not Found o 410 Gone: el usuario revocó el permiso o cambió de dispositivo
          if (errStatus === 404 || errStatus === 410) {
            this.logger.warn(
              `Suscripción caducada (${errStatus}). Purgando endpoint: ${sub.endpoint.slice(0, 40)}...`,
            );
            await sub.destroy().catch(() => {});
          } else {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.warn(
              `Fallo al entregar push a dispositivo ${sub.id}: ${msg}`,
            );
          }
        }
      }

      return delivered;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error general en despacho Push para usuario ${userId}: ${msg}`,
      );

      return 0;
    }
  }

  /**
   * Envía una notificación Push de prueba al usuario solicitante para validar su dispositivo.
   */
  async sendTestPush(
    userId: number,
  ): Promise<{ success: boolean; deliveredCount: number }> {
    const deliveredCount = await this.sendToUser(userId, {
      title: '🔔 HelpCopies ERP - Notificación de Prueba',
      body: '¡Todo listo! Tu dispositivo está configurado correctamente para recibir alertas en tiempo real.',
      data: {
        url: '/myprofile',
      },
      tag: 'test-notification',
    });

    return {
      success: deliveredCount > 0,
      deliveredCount,
    };
  }
}
