import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import * as bcrypt from 'bcrypt';
import { Company, CompanyStatus, DEFAULT_ENABLED_MODULES } from './company.model';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompanyDto } from './dto/query-company.dto';
import { Users, UserStatus } from '../users/users.model';
import { Role } from '../role/role.model';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.model';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
    private readonly sequelize: Sequelize,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateCompanyDto, actorUserId?: number): Promise<any> {
    const slug = dto.slug.toLowerCase().trim();
    const existingSlug = await this.companyModel.findOne({
      where: { slug },
    });
    if (existingSlug) {
      throw new BadRequestException(
        `El slug '${dto.slug}' ya se encuentra en uso por otra compañía`,
      );
    }

    const adminEmail = (dto.adminEmail || dto.email || `admin@${slug}.com`).toLowerCase().trim();
    const existingAdminEmail = await Users.findOne({
      where: { email: adminEmail },
    });
    if (existingAdminEmail) {
      throw new BadRequestException(
        `Ya existe un usuario con el email '${adminEmail}'. Especifique un adminEmail diferente.`,
      );
    }

    const adminUsername = (dto.adminUsername || `admin_${slug.replace(/[^a-zA-Z0-9]/g, '_')}`).toLowerCase().trim();
    const existingUsername = await Users.findOne({
      where: { username: adminUsername },
    });
    if (existingUsername) {
      throw new BadRequestException(
        `El nombre de usuario '${adminUsername}' ya existe en el sistema.`,
      );
    }

    const companyAdminRole = await Role.findOne({
      where: { slug: 'company_admin', userId: null },
    }) || await Role.findOne({
      where: { slug: 'admin', userId: null },
    });

    if (!companyAdminRole) {
      throw new BadRequestException(
        'El rol Administrador de Compañía (company_admin) no está inicializado en el sistema',
      );
    }

    const rawPassword = dto.adminPassword || `${slug}2026!`;
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const transaction = await this.sequelize.transaction();
    try {
      // 1. Crear la Compañía
      const company = await this.companyModel.create(
        {
          ...dto,
          slug,
          status: dto.status || CompanyStatus.ACTIVE,
          maxUsers: dto.maxUsers || 10,
          enabledModules: dto.enabledModules && dto.enabledModules.length > 0
            ? dto.enabledModules
            : DEFAULT_ENABLED_MODULES,
        } as never,
        { transaction },
      );

      // 2. Crear por defecto el Usuario Administrador para esta compañía
      const adminUser = await Users.create(
        {
          name: dto.adminName || 'Admin',
          lastName: dto.adminLastName || company.name,
          email: adminEmail,
          username: adminUsername,
          password: hashedPassword,
          phone: dto.phone || null,
          roleId: companyAdminRole.id,
          companyId: company.id,
          isAdmin: true,
          status: UserStatus.ACTIVE,
          createdByAdminId: actorUserId || null,
        } as never,
        { transaction },
      );

      await transaction.commit();

      // 3. Auditoría de creación de compañía y admin
      await this.auditService.log({
        action: AuditAction.CREATE,
        entity: 'Company',
        entityId: company.id,
        companyId: company.id,
        userId: actorUserId,
        payload: {
          company: company.toJSON(),
          initialAdminUserId: adminUser.id,
        },
        description: `Se ha creado la compañía '${company.name}' y su administrador '${adminUser.username}'`,
      });

      // 4. Notificación al actor
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
          temporaryPassword: dto.adminPassword ? undefined : rawPassword,
          role: companyAdminRole.slug,
        },
      };
    } catch (error) {
      await transaction.rollback();
      this.logger.error(`Error al crear la compañía: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAll(query: QueryCompanyDto) {
    const { search, status, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const where: WhereOptions<Company> = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      const searchWildcard = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.iLike ? Op.iLike : Op.like]: searchWildcard } },
        { slug: { [Op.iLike ? Op.iLike : Op.like]: searchWildcard } },
        { legalName: { [Op.iLike ? Op.iLike : Op.like]: searchWildcard } },
        { taxId: { [Op.iLike ? Op.iLike : Op.like]: searchWildcard } },
        { email: { [Op.iLike ? Op.iLike : Op.like]: searchWildcard } },
      ];
    }

    const { rows, count } = await this.companyModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    // Anexar conteo de usuarios activos por compañía
    const companiesWithCounts = await Promise.all(
      rows.map(async (comp) => {
        const activeUsersCount = await Users.count({
          where: {
            companyId: comp.id,
            status: { [Op.ne]: UserStatus.INACTIVE },
          },
        });
        const compJson = comp.toJSON();
        compJson.activeUsersCount = activeUsersCount;
        return compJson;
      }),
    );

    return {
      data: companiesWithCounts,
      meta: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    };
  }

  async findById(id: number): Promise<Company> {
    const company = await this.companyModel.findByPk(id);
    if (!company) {
      throw new NotFoundException(`La compañía con ID ${id} no existe`);
    }
    return company;
  }

  async findBySlug(slug: string): Promise<Company> {
    const company = await this.companyModel.findOne({
      where: { slug: slug.toLowerCase().trim() },
    });
    if (!company) {
      throw new NotFoundException(`La compañía con slug '${slug}' no existe`);
    }
    return company;
  }

  async update(
    id: number,
    dto: UpdateCompanyDto,
    actorUserId?: number,
  ): Promise<Company> {
    const company = await this.findById(id);

    if (dto.slug && dto.slug.toLowerCase().trim() !== company.slug) {
      const slugTaken = await this.companyModel.findOne({
        where: {
          slug: dto.slug.toLowerCase().trim(),
          id: { [Op.ne]: id },
        },
      });
      if (slugTaken) {
        throw new BadRequestException(
          `El slug '${dto.slug}' ya se encuentra en uso por otra compañía`,
        );
      }
    }

    const transaction = await this.sequelize.transaction();
    try {
      const prevData = company.toJSON();
      await company.update(
        {
          ...dto,
          slug: dto.slug ? dto.slug.toLowerCase().trim() : company.slug,
        },
        { transaction },
      );
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

      return company;
    } catch (error) {
      await transaction.rollback();
      this.logger.error(`Error al actualizar la compañía ${id}: ${error.message}`);
      throw error;
    }
  }

  async changeStatus(
    id: number,
    status: CompanyStatus,
    actorUserId?: number,
  ): Promise<Company> {
    const company = await this.findById(id);

    const transaction = await this.sequelize.transaction();
    try {
      const prevStatus = company.status;
      await company.update({ status }, { transaction });
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

      // Desactivar usuarios vinculados
      await Users.update(
        { status: UserStatus.INACTIVE },
        { where: { companyId: id }, transaction },
      );

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

      return {
        success: true,
        message: `Compañía '${company.name}' eliminada correctamente`,
      };
    } catch (error) {
      await transaction.rollback();
      this.logger.error(`Error al eliminar la compañía ${id}: ${error.message}`);
      throw error;
    }
  }
}
