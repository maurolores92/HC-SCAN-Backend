import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, Op, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { DEFAULT_PLAN_MODULES, Plan } from './plan.model';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { QueryPlanDto } from './dto/query-plan.dto';
import { Company } from '../companies/company.model';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.model';
import { ExchangeRateService, PlanPublicWithExchangeRate } from './services/exchange-rate.service';

import { defaultPlansData } from '../seeders/data/plans.data';

/**
 * Servicio de gestión del catálogo de Planes de Suscripción (exclusivo Super Admin).
 */
@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @InjectModel(Plan) private readonly planModel: typeof Plan,
    @InjectModel(Company) private readonly companyModel: typeof Company,
    private readonly sequelize: Sequelize,
    private readonly auditService: AuditService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  /**
   * Retorna el catálogo público de planes activos para la web institucional.
   * Si la tabla está vacía, aprovisiona de forma automática los planes predeterminados.
   * Todos los precios se retornan calculados en PESOS (ARS) redondeados hacia arriba.
   */
  async findAllPublic(): Promise<PlanPublicWithExchangeRate[]> {
    let plans = await this.planModel.findAll({
      where: { isActive: true },
      order: [
        ['isTrial', 'DESC'],
        ['priceMonthly', 'ASC'],
        ['id', 'ASC'],
      ],
      attributes: [
        'id',
        'name',
        'slug',
        'description',
        'priceMonthly',
        'currency',
        'isTrial',
        'trialDays',
        'maxUsers',
        'maxDocuments',
        'maxStorageMb',
        'maxAiQueriesMonthly',
        'includedModules',
        'badgeColor',
        'isDefault',
      ],
    });

    if (plans.length === 0) {
      plans = await this.seedDefaultPublicPlans();
    }

    return Promise.all(
      plans.map((p) => this.exchangeRateService.formatPlanForPublicWeb(p)),
    );
  }

  private async seedDefaultPublicPlans(): Promise<Plan[]> {
    const created: Plan[] = [];
    for (const d of defaultPlansData) {
      const plan = await this.planModel.create(d as any);
      created.push(plan);
    }
    return created;
  }

  /**
   * Crea un nuevo plan de suscripción asegurando unicidad de slug y consistencia de `isDefault`.
   */
  async create(dto: CreatePlanDto, actorUserId?: number): Promise<Plan> {
    const slug = dto.slug.toLowerCase().trim();
    const existing = await this.planModel.findOne({ where: { slug } });
    if (existing) {
      throw new BadRequestException(`Ya existe un plan con el slug '${slug}'`);
    }

    const transaction = await this.sequelize.transaction();
    try {
      if (dto.isDefault) {
        await this.planModel.update(
          { isDefault: false },
          { where: { isDefault: true }, transaction },
        );
      }

      const plan = await this.planModel.create(
        {
          name: dto.name.trim(),
          slug,
          description: dto.description ?? null,
          priceMonthly: dto.priceMonthly ?? 0,
          maxUsers: dto.maxUsers !== undefined ? dto.maxUsers : 10,
          maxDocuments: dto.maxDocuments !== undefined ? dto.maxDocuments : 1000,
          maxStorageMb: dto.maxStorageMb !== undefined ? dto.maxStorageMb : 5120,
          maxAiQueriesMonthly:
            dto.maxAiQueriesMonthly !== undefined ? dto.maxAiQueriesMonthly : 500,
          includedModules:
            dto.includedModules && dto.includedModules.length > 0
              ? dto.includedModules
              : DEFAULT_PLAN_MODULES,
          badgeColor: dto.badgeColor || 'primary',
          isDefault: Boolean(dto.isDefault),
          isActive: dto.isActive !== undefined ? dto.isActive : true,
        } as never,
        { transaction },
      );

      await transaction.commit();

      await this.auditService.log({
        action: AuditAction.CREATE,
        entity: 'Plan',
        entityId: plan.id,
        userId: actorUserId,
        payload: plan.toJSON(),
        description: `Se creó el plan de suscripción '${plan.name}' (${plan.slug})`,
      });

      return plan;
    } catch (error: any) {
      await transaction.rollback();
      this.logger.error(`Error al crear plan: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lista todos los planes anexando la cantidad de compañías suscriptas a cada uno sin consultas N+1.
   */
  async findAll(query: QueryPlanDto = {}) {
    const where: WhereOptions<Plan> = {};

    if (query.includeInactive !== 'true') {
      where.isActive = true;
    }

    if (query.search) {
      const wildcard = `%${query.search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.iLike ? Op.iLike : Op.like]: wildcard } },
        { slug: { [Op.iLike ? Op.iLike : Op.like]: wildcard } },
      ];
    }

    const [plans, countsRaw] = await Promise.all([
      this.planModel.findAll({
        where,
        order: [
          ['priceMonthly', 'ASC'],
          ['id', 'ASC'],
        ],
      }),
      this.companyModel.findAll({
        attributes: ['planId', [fn('COUNT', col('id')), 'companiesCount']],
        where: { planId: { [Op.ne]: null } },
        group: ['planId'],
        raw: true,
      }) as unknown as Promise<Array<{ planId: number; companiesCount: string | number }>>,
    ]);

    const countMap = new Map<number, number>(
      countsRaw.map((c) => [Number(c.planId), Number(c.companiesCount || 0)]),
    );

    const data = plans.map((plan) => ({
      ...plan.toJSON(),
      companiesCount: countMap.get(plan.id) ?? 0,
    }));

    return {
      data,
      total: data.length,
    };
  }

  /**
   * Obtiene un plan por su ID.
   */
  async findById(id: number): Promise<Plan> {
    const plan = await this.planModel.findByPk(id);
    if (!plan) {
      throw new NotFoundException(`El plan con ID ${id} no existe`);
    }
    return plan;
  }

  /**
   * Retorna el plan configurado por defecto (o el primer plan activo disponible).
   */
  async findDefaultPlan(): Promise<Plan | null> {
    const defaultPlan = await this.planModel.findOne({
      where: { isDefault: true, isActive: true },
    });
    if (defaultPlan) return defaultPlan;

    return this.planModel.findOne({
      where: { isActive: true },
      order: [['id', 'ASC']],
    });
  }

  /**
   * Actualiza los límites, módulos o estado de un plan existente.
   */
  async update(
    id: number,
    dto: UpdatePlanDto,
    actorUserId?: number,
  ): Promise<Plan> {
    const plan = await this.findById(id);

    if (dto.slug && dto.slug.toLowerCase().trim() !== plan.slug) {
      const normalizedSlug = dto.slug.toLowerCase().trim();
      const taken = await this.planModel.findOne({
        where: { slug: normalizedSlug, id: { [Op.ne]: id } },
      });
      if (taken) {
        throw new BadRequestException(`El slug '${normalizedSlug}' ya está en uso por otro plan`);
      }
    }

    const transaction = await this.sequelize.transaction();
    try {
      const previousData = plan.toJSON();

      if (dto.isDefault === true) {
        await this.planModel.update(
          { isDefault: false },
          { where: { id: { [Op.ne]: id }, isDefault: true }, transaction },
        );
      }

      await plan.update(
        {
          ...dto,
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.slug ? { slug: dto.slug.toLowerCase().trim() } : {}),
        },
        { transaction },
      );

      await transaction.commit();

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entity: 'Plan',
        entityId: plan.id,
        userId: actorUserId,
        payload: { previous: previousData, updated: plan.toJSON() },
        description: `Se actualizó el plan de suscripción '${plan.name}'`,
      });

      return plan;
    } catch (error: any) {
      await transaction.rollback();
      this.logger.error(`Error al actualizar plan ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Elimina un plan verificando previamente que no existan compañías vinculadas.
   */
  async remove(id: number, actorUserId?: number): Promise<{ success: boolean; message: string }> {
    const plan = await this.findById(id);

    const linkedCompaniesCount = await this.companyModel.count({
      where: { planId: id },
    });

    if (linkedCompaniesCount > 0) {
      throw new BadRequestException(
        `No se puede eliminar el plan '${plan.name}' porque tiene ${linkedCompaniesCount} compañía(s) asociada(s). Reasigne las compañías o desactive el plan.`,
      );
    }

    const deletedSnapshot = plan.toJSON();
    await plan.destroy();

    await this.auditService.log({
      action: AuditAction.DELETE,
      entity: 'Plan',
      entityId: id,
      userId: actorUserId,
      payload: deletedSnapshot,
      description: `Se eliminó el plan de suscripción '${plan.name}'`,
    });

    return {
      success: true,
      message: `Plan '${plan.name}' eliminado correctamente`,
    };
  }
}
