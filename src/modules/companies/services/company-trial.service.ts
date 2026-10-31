import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Op } from 'sequelize';
import { Company, CompanyStatus } from '../company.model';
import { Users, UserStatus } from '../../users/users.model';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/audit.model';

@Injectable()
export class CompanyTrialService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompanyTrialService.name);
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(private readonly auditService: AuditService) {}

  async onModuleInit() {
    // Verificación inmediata al iniciar el servidor
    await this.checkAndDeactivateExpiredTrials();

    // Verificación recurrente cada 30 minutos
    this.checkInterval = setInterval(
      () => {
        this.checkAndDeactivateExpiredTrials().catch((err) =>
          this.logger.error(`Error al verificar vencimientos de prueba: ${err.message}`),
        );
      },
      30 * 60 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Busca todas las compañías en estado ACTIVO cuyo período de prueba haya expirado (trial_ends_at <= NOW()),
   * y las pasa automáticamente a estado INACTIVO junto con todos sus usuarios.
   */
  async checkAndDeactivateExpiredTrials(): Promise<number> {
    const now = new Date();
    const expiredCompanies = await Company.findAll({
      where: {
        status: CompanyStatus.ACTIVE,
        trialEndsAt: {
          [Op.ne]: null,
          [Op.lte]: now,
        },
      },
    });

    if (expiredCompanies.length === 0) {
      return 0;
    }

    this.logger.warn(
      `[CompanyTrialService] Se detectaron ${expiredCompanies.length} empresas con período de prueba vencido. Procediendo a desactivación...`,
    );

    let deactivatedCount = 0;
    for (const company of expiredCompanies) {
      try {
        await company.update({ status: CompanyStatus.INACTIVE });

        const [affectedUsers] = await Users.update(
          { status: UserStatus.INACTIVE },
          { where: { companyId: company.id } },
        );

        this.logger.warn(
          `[CompanyTrialService] Empresa '${company.name}' (ID ${company.id}) y sus ${affectedUsers} usuarios fueron desactivados por vencer sus 6 días de prueba.`,
        );

        await this.auditService.log({
          action: AuditAction.STATUS_CHANGE,
          entity: 'Company',
          entityId: company.id,
          companyId: company.id,
          payload: {
            reason: 'trial_expired_6_days',
            trialEndsAt: company.trialEndsAt,
            usersDeactivated: affectedUsers,
          },
          description: `Período de prueba de 6 días finalizado. Empresa '${company.name}' y usuarios desactivados automáticamente.`,
        });

        deactivatedCount++;
      } catch (error: any) {
        this.logger.error(
          `[CompanyTrialService] Error al desactivar empresa ID ${company.id}: ${error.message}`,
        );
      }
    }

    return deactivatedCount;
  }
}

