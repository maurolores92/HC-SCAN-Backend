import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Plan } from '../plan.model';
import { CompanyMonthlyUsage } from '../models/company-monthly-usage.model';
import { Company, CompanyStatus } from '../../companies/company.model';
import { Users, UserStatus } from '../../users/users.model';
import { Document } from '../../documents/document.model';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/audit.model';
import { CompanyQuotaSummaryService } from './company-quota-summary.service';
import {
  bytesToMegabytes,
  CompanyQuotaSummary,
  getCurrentBillingPeriod,
  resolveCompanyEffectiveLimits,
} from '../helpers/quota-calculator.helper';

const WARNING_THRESHOLD_PERCENT = 85;

/**
 * Servicio transversal encargado de aplicar límites de usuarios, documentos/storage
 * y consultas mensuales de IA por compañía, delegando resúmenes a `CompanyQuotaSummaryService`.
 */
@Injectable()
export class TenantQuotasService {
  constructor(
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(Users) private readonly userModel: typeof Users,
    @InjectModel(Document) private readonly documentModel: typeof Document,
    @InjectModel(CompanyMonthlyUsage)
    private readonly monthlyUsageModel: typeof CompanyMonthlyUsage,
    private readonly sequelize: Sequelize,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    private readonly quotaSummaryService: CompanyQuotaSummaryService,
  ) {}

  async getCompanyQuotaSummary(companyId: number): Promise<CompanyQuotaSummary> {
    return this.quotaSummaryService.getCompanyQuotaSummary(companyId);
  }

  async getBatchQuotaSummaries(companies: Company[]): Promise<Map<number, CompanyQuotaSummary>> {
    return this.quotaSummaryService.getBatchQuotaSummaries(companies);
  }

  /**
   * Valida que la compañía esté activa y no haya alcanzado su tope de usuarios activos.
   */
  async assertCanCreateOrActivateUser(companyId: number, transaction?: Transaction): Promise<void> {
    const company = await this.loadActiveCompanyWithPlan(companyId, transaction);
    const limits = resolveCompanyEffectiveLimits(company);
    if (limits.maxUsers === null) return;

    const currentActiveUsers = await this.userModel.count({
      where: { companyId, status: { [Op.ne]: UserStatus.INACTIVE } },
      transaction,
    });

    if (currentActiveUsers >= limits.maxUsers) {
      throw new BadRequestException(
        `La compañía '${company.name}' ha alcanzado el límite máximo de usuarios permitidos (${limits.maxUsers}). Actualice su plan para agregar más usuarios.`,
      );
    }

    await this.emitWarningIfNearThreshold(companyId, 'usuarios', currentActiveUsers + 1, limits.maxUsers);
  }

  /**
   * Evalúa si es posible almacenar un nuevo archivo PDF según cantidad máxima y espacio en MB.
   */
  async checkDocumentQuota(
    companyId: number,
    incomingFileSizeBytes: number,
    transaction?: Transaction,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const company = await this.loadActiveCompanyWithPlan(companyId, transaction);
    const limits = resolveCompanyEffectiveLimits(company);

    const [aggregate] = (await this.documentModel.findAll({
      attributes: [
        [fn('COUNT', col('id')), 'docsCount'],
        [fn('COALESCE', fn('SUM', col('file_size')), 0), 'totalBytes'],
      ],
      where: { companyId },
      raw: true,
      transaction,
    })) as unknown as Array<{ docsCount: string | number; totalBytes: string | number }>;

    const currentDocs = Number(aggregate?.docsCount || 0);
    const currentBytes = Number(aggregate?.totalBytes || 0);

    if (limits.maxDocuments !== null && currentDocs >= limits.maxDocuments) {
      return {
        allowed: false,
        reason: `Se alcanzó el límite máximo de documentos permitidos en su plan (${limits.maxDocuments} archivos PDF).`,
      };
    }

    const projectedMb = bytesToMegabytes(currentBytes + incomingFileSizeBytes);
    if (limits.maxStorageMb !== null && projectedMb > limits.maxStorageMb) {
      return {
        allowed: false,
        reason: `El archivo supera la cuota de almacenamiento disponible de su plan (${bytesToMegabytes(currentBytes)} MB usados de ${limits.maxStorageMb} MB).`,
      };
    }

    if (limits.maxDocuments !== null) {
      await this.emitWarningIfNearThreshold(companyId, 'documentos PDF', currentDocs + 1, limits.maxDocuments);
    }
    if (limits.maxStorageMb !== null) {
      await this.emitWarningIfNearThreshold(companyId, 'almacenamiento (MB)', projectedMb, limits.maxStorageMb);
    }

    return { allowed: true };
  }

  async assertCanStoreDocument(
    companyId: number,
    incomingFileSizeBytes: number,
    transaction?: Transaction,
  ): Promise<void> {
    const check = await this.checkDocumentQuota(companyId, incomingFileSizeBytes, transaction);
    if (!check.allowed) {
      await this.notifyQuotaExceeded(companyId, check.reason!);
      throw new BadRequestException(check.reason);
    }
  }

  /**
   * Verifica disponibilidad de consultas de Chat IA en el período mensual vigente ('YYYY-MM').
   */
  async assertCanExecuteAiQuery(companyId: number): Promise<void> {
    const company = await this.loadActiveCompanyWithPlan(companyId);
    const limits = resolveCompanyEffectiveLimits(company);
    if (limits.maxAiQueriesMonthly === null) return;
    if (limits.maxAiQueriesMonthly <= 0) {
      throw new ForbiddenException('Su plan actual no incluye consultas a la Inteligencia Artificial.');
    }

    const period = getCurrentBillingPeriod();
    const usage = await this.monthlyUsageModel.findOne({ where: { companyId, period } });
    const usedQueries = usage?.aiQueriesCount ?? 0;

    if (usedQueries >= limits.maxAiQueriesMonthly) {
      const msg = `Se alcanzó el límite mensual de consultas a la IA (${limits.maxAiQueriesMonthly} consultas en ${period}).`;
      await this.notifyQuotaExceeded(companyId, msg);
      throw new ForbiddenException(msg);
    }
  }

  /**
   * Registra e incrementa atómicamente una consulta conversacional al Chat IA en el mes actual.
   */
  async consumeAiQuery(
    companyId: number,
    options: { tokensUsed?: number; isDocumentExtraction?: boolean; actorUserId?: number } = {},
  ): Promise<CompanyMonthlyUsage> {
    await this.assertCanExecuteAiQuery(companyId);
    const period = getCurrentBillingPeriod();
    const transaction = await this.sequelize.transaction();

    try {
      const [usage] = await this.monthlyUsageModel.findOrCreate({
        where: { companyId, period },
        defaults: { companyId, period, aiQueriesCount: 0, aiDocumentsProcessed: 0, tokensUsed: 0 },
        transaction,
      });

      await usage.increment(
        {
          aiQueriesCount: 1,
          aiDocumentsProcessed: options.isDocumentExtraction ? 1 : 0,
          tokensUsed: options.tokensUsed ?? 0,
        },
        { transaction },
      );

      await usage.reload({ transaction });
      await transaction.commit();

      const company = await this.loadActiveCompanyWithPlan(companyId);
      const limits = resolveCompanyEffectiveLimits(company);
      if (limits.maxAiQueriesMonthly !== null) {
        await this.emitWarningIfNearThreshold(
          companyId,
          'consultas mensuales de IA',
          usage.aiQueriesCount,
          limits.maxAiQueriesMonthly,
        );
      }

      if (options.actorUserId) {
        await this.auditService.log({
          action: AuditAction.AI_QUERY,
          entity: 'Company',
          entityId: companyId,
          companyId,
          userId: options.actorUserId,
          payload: { period, aiQueriesCount: usage.aiQueriesCount, tokensUsed: options.tokensUsed ?? 0 },
        });
      }

      return usage;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Contabiliza la extracción automática de un documento PDF en `aiDocumentsProcessed`
   * sin descontar consultas del cupo de Chat IA (`maxAiQueriesMonthly`).
   */
  async recordDocumentAiProcessing(
    companyId: number,
    options: { tokensUsed?: number } = {},
  ): Promise<CompanyMonthlyUsage> {
    const period = getCurrentBillingPeriod();
    const transaction = await this.sequelize.transaction();
    try {
      const [usage] = await this.monthlyUsageModel.findOrCreate({
        where: { companyId, period },
        defaults: { companyId, period, aiQueriesCount: 0, aiDocumentsProcessed: 0, tokensUsed: 0 },
        transaction,
      });

      await usage.increment(
        { aiDocumentsProcessed: 1, tokensUsed: options.tokensUsed ?? 0 },
        { transaction },
      );

      await usage.reload({ transaction });
      await transaction.commit();
      return usage;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async notifyQuotaExceeded(companyId: number, detailMessage: string): Promise<void> {
    await this.notificationsService.dispatch({
      type: 'company.quota_exceeded',
      title: '🛑 Límite de plan alcanzado',
      body: detailMessage,
      companyId,
    });
  }

  private async loadActiveCompanyWithPlan(
    companyId: number,
    transaction?: Transaction,
  ): Promise<Company> {
    const company = await this.companyModel.findByPk(companyId, {
      include: [{ model: Plan, as: 'plan' }],
      transaction,
    });
    if (!company) {
      throw new BadRequestException('La compañía especificada no existe');
    }
    if (company.status === CompanyStatus.INACTIVE || company.status === CompanyStatus.SUSPENDED) {
      throw new BadRequestException('La compañía se encuentra inactiva o suspendida');
    }
    return company;
  }

  private async emitWarningIfNearThreshold(
    companyId: number,
    resourceLabel: string,
    projectedValue: number,
    maxLimit: number,
  ): Promise<void> {
    if (maxLimit <= 0) return;
    const prevPct = Math.round(((projectedValue - 1) / maxLimit) * 100);
    const nextPct = Math.round((projectedValue / maxLimit) * 100);

    if (prevPct < WARNING_THRESHOLD_PERCENT && nextPct >= WARNING_THRESHOLD_PERCENT && nextPct < 100) {
      await this.notificationsService.dispatch({
        type: 'company.quota_warning',
        title: '⚡ Cupo próximo al límite',
        body: `El consumo de ${resourceLabel} alcanzó el ${nextPct}% de su plan (${projectedValue} de ${maxLimit}).`,
        companyId,
      });
    }
  }
}
