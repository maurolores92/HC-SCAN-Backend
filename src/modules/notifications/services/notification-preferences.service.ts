import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { NotificationPreference } from '../models/notification-preference.model';
import { NOTIFICATION_REGISTRY } from '../constants/notification-registry';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';

/**
 * @service NotificationPreferencesService
 * Gestiona las preferencias de notificaciones in-app por usuario y tipo de evento.
 */
@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(
    @InjectModel(NotificationPreference)
    private readonly preferenceModel: typeof NotificationPreference,
  ) {}

  /**
   * Verifica si el usuario tiene activo el canal in-app para este tipo de notificación.
   * Si no existe registro en la tabla de preferencias, se considera ACTIVO por defecto.
   */
  async isTypeEnabledForUser(userId: number, type: string): Promise<boolean> {
    try {
      const pref = await this.preferenceModel.findOne({
        where: { userId, notificationType: type },
      });
      return pref ? pref.inApp !== false : true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to check preference for user ${userId} and type ${type}: ${msg}`,
      );
      return true;
    }
  }

  /**
   * Obtiene preferencias del usuario (crea defaults si no existen).
   */
  async getPreferences(userId: number): Promise<NotificationPreference[]> {
    const allTypes = Object.keys(NOTIFICATION_REGISTRY).filter(
      (k) => k !== 'SERVICE_ORDER_ROUTE_CHANGED',
    );

    for (const type of allTypes) {
      await this.preferenceModel.findOrCreate({
        where: { userId, notificationType: type },
        defaults: { userId, notificationType: type, inApp: true },
      });
    }

    return this.preferenceModel.findAll({ where: { userId } });
  }

  /**
   * Actualiza múltiples preferencias del usuario.
   */
  async updatePreferences(
    userId: number,
    dto: UpdatePreferencesDto,
  ): Promise<NotificationPreference[]> {
    for (const item of dto.preferences) {
      await this.preferenceModel.upsert({
        userId,
        notificationType: item.notificationType,
        inApp: item.inApp,
      });
    }
    return this.getPreferences(userId);
  }
}
