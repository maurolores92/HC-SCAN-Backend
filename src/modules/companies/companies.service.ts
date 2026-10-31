import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Company, CompanyStatus } from './company.model';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompanyDto } from './dto/query-company.dto';
import { Users, UserStatus } from '../users/users.model';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.model';
import { NotificationsService } from '../notifications/notifications.service';
import { Plan } from '../plans/plan.model';
import { PlansService } from '../plans/plans.service';
import { TenantQuotasService } from '../plans/services/tenant-quotas.service';
import { ensureTenantDirectories } from '../../common/utils/storage-path.util';
import {
  buildCompanyCreationAttributes,
  buildCompanySearchWhere,
  prepareInitialCompanyAdmin,
} from './helpers/company-onboarding.helper';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
    private readonly sequelize: Sequelize,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly plansService: PlansService,
    private readonly tenantQuotasService: TenantQuotasService,
  ) {}

  async create(dto: CreateCompanyDto, actorUserId?: number): Promise<any> {
    const slug = dto.slug.toLowerCase().trim();
    const existingSlug = await this.companyModel.findOne({ where: { slug } });
    if (existingSlug) {
      throw new BadRequestException(`El slug '${dto.slug}' ya se encuentra en uso por otra compañía`);
    }

    const assignedPlan = dto.planId
      ? await this.plansService.findById(dto.planId)
      : await this.plansService.findDefaultPlan();

    const adminSetup = await prepareInitialCompanyAdmin(dto, slug);
    const transaction = await this.sequelize.transaction();

    try {
      const company = await this.companyModel.create(
        buildCompanyCreationAttributes(dto, slug, assignedPlan) as never,
        { transaction },
      );

      const adminUser = await Users.create(
        {
          name: dto.adminName || 'Admin',
          lastName: dto.adminLastName || company.name,
          email: adminSetup.adminEmail,
          username: adminSetup.adminUsername,
          password: adminSetup.hashedPassword,
          phone: dto.phone || null,
          roleId: adminSetup.companyAdminRole.id,
          companyId: company.id,
          isAdmin: true,
          status: UserStatus.ACTIVE,
          createdByAdminId: actorUserId || null,
        } as never,
        { transaction },
      );

      await transaction.commit();

      // Aprovisionar inmediatamente su estructura física aislada storage/tenancy/company_<id>/{inbox,vault,quarantine}
      ensureTenantDirectories(company.id);

      await this.auditService.log({
        action: AuditAction.CREATE,
        entity: 'Company',
        entityId: company.id,
        companyId: company.id,
        userId: actorUserId,
        payload: {
          company: company.toJSON(),
          initialAdminUserId: adminUser.id,
          planSlug: assignedPlan?.slug ?? null,
        },
        description: `Se ha creado la compañía '${company.name}' (Plan: ${assignedPlan?.name || 'Personalizado'}) y su administrador '${adminUser.username}'`,
      });

      if (actorUserId) {
        await this.notificationsService.notifyUser({
          userId: actorUserId,
          type: 'system.company_created',
          title: 'Nueva compañía y administrador creados',
          body: `Se creó exitosamente la compañía ${company.name} con su administrador ${adminUser.email}`,
          companyId: company.id,
        });
      }

      return {
        company,
        initialAdmin: {
          id: adminUser.id,
          name: adminUser.name,
          lastName: adminUser.lastName,
          email: adminUser.email,
          username: adminUser.username,
          temporaryPassword: dto.adminPassword ? undefined : adminSetup.rawPassword,
          role: adminSetup.companyAdminRole.slug,
        },
      };
    } catch (error: any) {
      await transaction.rollback();
      this.logger.error(`Error al crear la compañía: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAll(query: QueryCompanyDto) {
    const { page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;
    const where = buildCompanySearchWhere(query);

    const { rows, count } = await this.companyModel.findAndCountAll({
      where,
      limit,
      offset,
      include: [{ model: Plan, as: 'plan' }],
      order: [['createdAt', 'DESC']],
    });

    const quotaMap = await this.tenantQuotasService.getBatchQuotaSummaries(rows);
    const companiesWithQuotas = rows.map((comp) => {
      const compJson = comp.toJSON();
      const quotaSummary = quotaMap.get(comp.id);
      compJson.activeUsersCount = quotaSummary?.users.current ?? 0;
      compJson.quotaSummary = quotaSummary ?? null;
      return compJson;
    });

    return {
      data: companiesWithQuotas,
      meta: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    };
  }

  async findById(id: number): Promise<any> {
    const company = await this.companyModel.findByPk(id, {
      include: [{ model: Plan, as: 'plan' }],
    });
    if (!company) {
      throw new NotFoundException(`La compañía con ID ${id} no existe`);
    }
    return company;
  }

  async findBySlug(slug: string): Promise<Company> {
    const company = await this.companyModel.findOne({
      where: { slug: slug.toLowerCase().trim() },
      include: [{ model: Plan, as: 'plan' }],
    });
    if (!company) {
      throw new NotFoundException(`La compañía con slug '${slug}' no existe`);
    }
    return company;
  }

  async update(id: number, dto: UpdateCompanyDto, actorUserId?: number): Promise<Company> {
    const company = await this.companyModel.findByPk(id, {
      include: [{ model: Plan, as: 'plan' }],
    });
    if (!company) {
      throw new NotFoundException(`La compañía con ID ${id} no existe`);
    }

    if (dto.slug && dto.slug.toLowerCase().trim() !== company.slug) {
      const slugTaken = await this.companyModel.findOne({
        where: { slug: dto.slug.toLowerCase().trim(), id: { [Op.ne]: id } },
      });
      if (slugTaken) {
        throw new BadRequestException(`El slug '${dto.slug}' ya se encuentra en uso por otra compañía`);
      }
    }

    const resolvedPlan =
      dto.planId !== undefined && dto.planId !== null
        ? await this.plansService.findById(dto.planId)
        : null;

    const planOrLimitsChanged =
      (dto.planId !== undefined && dto.planId !== company.planId) ||
      (dto.useCustomLimits !== undefined && dto.useCustomLimits !== company.useCustomLimits);

    const transaction = await this.sequelize.transaction();
    try {
      const prevData = company.toJSON();
      const payloadDto: any = { ...dto, slug: dto.slug ? dto.slug.toLowerCase().trim() : company.slug };

      if (dto.status === CompanyStatus.ACTIVE) {
        await Users.update({ status: UserStatus.ACTIVE }, { where: { companyId: id }, transaction });
        if (company.trialEndsAt && new Date(company.trialEndsAt) <= new Date() && dto.trialEndsAt === undefined) {
          payloadDto.trialEndsAt = null;
          payloadDto.isTrial = false;
        }
      } else if (dto.status === CompanyStatus.INACTIVE || dto.status === CompanyStatus.SUSPENDED) {
        await Users.update({ status: UserStatus.INACTIVE }, { where: { companyId: id }, transaction });
      }

      await company.update(payloadDto, { transaction });
      await transaction.commit();

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entity: 'Company',
        entityId: company.id,
        companyId: company.id,
        userId: actorUserId,
        payload: { previous: prevData, updated: company.toJSON() },
        description: `Se actualizó la información de la compañía '${company.name}'`,
      });

      if (planOrLimitsChanged) {
        await this.notificationsService.dispatch({
          type: 'company.plan_updated',
          title: '🏅 Plan y límites actualizados',
          body: resolvedPlan
            ? `El plan de ${company.name} fue actualizado a '${resolvedPlan.name}'.`
            : `Se actualizaron los cupos operativos de ${company.name}.`,
          companyId: company.id,
          actorUser: { id: actorUserId },
        });
      }

      return this.findById(id);
    } catch (error: any) {
      await transaction.rollback();
      this.logger.error(`Error al actualizar la compañía ${id}: ${error.message}`);
      throw error;
    }
  }

  async changeStatus(id: number, status: CompanyStatus, actorUserId?: number): Promise<Company> {
    const company = await this.findById(id);
    const transaction = await this.sequelize.transaction();
    try {
      const prevStatus = company.status;
      const updates: any = { status };

      // Si el Superadmin reactiva una empresa inactiva/vencida, reactiva usuarios y limpia trial vencido
      if (status === CompanyStatus.ACTIVE) {
        await Users.update({ status: UserStatus.ACTIVE }, { where: { companyId: id }, transaction });
        if (company.trialEndsAt && new Date(company.trialEndsAt) <= new Date()) {
          updates.trialEndsAt = null;
          updates.isTrial = false;
        }
      } else if (status === CompanyStatus.INACTIVE || status === CompanyStatus.SUSPENDED) {
        await Users.update({ status: UserStatus.INACTIVE }, { where: { companyId: id }, transaction });
      }

      await company.update(updates, { transaction });
      await transaction.commit();

      await this.auditService.log({
        action: AuditAction.STATUS_CHANGE,
        entity: 'Company',
        entityId: company.id,
        companyId: company.id,
        userId: actorUserId,
        payload: { from: prevStatus, to: status },
        description: `Cambio de estado de la compañía '${company.name}' a ${status}`,
      });

      return company;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async remove(id: number, actorUserId?: number): Promise<{ success: boolean; message: string }> {
    const company = await this.findById(id);
    const transaction = await this.sequelize.transaction();
    try {
      const deletedData = company.toJSON();
      await Users.update({ status: UserStatus.INACTIVE }, { where: { companyId: id }, transaction });
      await company.destroy({ transaction });
      await transaction.commit();

      await this.auditService.log({
        action: AuditAction.DELETE,
        entity: 'Company',
        entityId: id,
        companyId: id,
        userId: actorUserId,
        payload: deletedData,
        description: `Se eliminó la compañía '${company.name}' y se desactivaron sus usuarios`,
      });

      return { success: true, message: `Compañía '${company.name}' eliminada correctamente` };
    } catch (error: any) {
      await transaction.rollback();
      this.logger.error(`Error al eliminar la compañía ${id}: ${error.message}`);
      throw error;
    }
  }
}
