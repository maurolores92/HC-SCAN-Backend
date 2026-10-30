import * as bcrypt from 'bcrypt';
import { Op, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CrudService } from '../../common/crud/crud.service';
import { Role } from '../role/role.model';
import { Company, CompanyStatus } from '../companies/company.model';
import { Permission } from '../permissions/permission.model';
import { Users, UserStatus } from './users.model';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.model';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersCustomRolesService } from './services/users-custom-roles.service';
import {
  UsersAuthProfileService,
  AdminActorContext,
} from './services/users-auth-profile.service';
import {
  buildUsersPaginatedWhere,
  toPlainUserRecord,
  validateUniqueUserCredentials,
} from './helpers/users-query.helper';

interface CreateOrUpdateUserPayload {
  name?: string;
  lastName?: string;
  email?: string;
  username?: string;
  password?: string;
  roleId?: number | null;
  companyId?: number | null;
  status?: string;
  document?: string | null;
  image?: string | null;
  isAdmin?: boolean;
  [key: string]: unknown;
}

@Injectable()
export class UsersService extends CrudService<Users> {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(Users) private readonly userModel: typeof Users,
    private sequelize: Sequelize,
    private auditService: AuditService,
    private notificationsService: NotificationsService,
    private customRolesService: UsersCustomRolesService,
    private authProfileService: UsersAuthProfileService,
  ) {
    super(userModel);
  }

  override async create(data: any, createdByAdminId?: number, adminCompanyId?: number): Promise<Users> {
    const transaction = await this.sequelize.transaction();
    try {
      const typedData = data as CreateOrUpdateUserPayload;
      const { roleId, password, ...userData } = typedData;

      await validateUniqueUserCredentials(
        this.userModel,
        { email: String(userData.email || ''), username: userData.username },
        transaction,
      );

      let finalRoleId: number | null = null;
      let isAdmin = false;

      if (roleId) {
        const role = await Role.findByPk(Number(roleId), { transaction });
        if (!role) {
          throw new BadRequestException('El rol especificado no existe');
        }
        finalRoleId = Number(roleId);
        isAdmin = role.slug === 'company_admin' || role.slug === 'admin';
      }

      const finalCompanyId = userData.companyId ?? adminCompanyId ?? null;

      // Validación estricta de límites de usuarios por compañía
      if (finalCompanyId) {
        const company = await Company.findByPk(finalCompanyId, { transaction });
        if (!company) {
          throw new BadRequestException('La compañía especificada no existe');
        }
        if (
          company.status === CompanyStatus.INACTIVE ||
          company.status === CompanyStatus.SUSPENDED
        ) {
          throw new BadRequestException('La compañía se encuentra inactiva o suspendida');
        }

        const currentActiveUsers = await this.userModel.count({
          where: {
            companyId: finalCompanyId,
            status: { [Op.ne]: UserStatus.INACTIVE },
          },
          transaction,
        });

        if (company.maxUsers > 0 && currentActiveUsers >= company.maxUsers) {
          throw new BadRequestException(
            `La compañía '${company.name}' ha alcanzado el límite máximo de usuarios permitidos (${company.maxUsers}).`,
          );
        }
      }

      const hashedPassword = await bcrypt.hash(String(password || ''), 10);

      const user = await this.userModel.create(
        {
          ...userData,
          password: hashedPassword,
          roleId: finalRoleId,
          companyId: finalCompanyId,
          isAdmin: userData.isAdmin || isAdmin,
          createdByAdminId: createdByAdminId || null,
          status: userData.status || UserStatus.ACTIVE,
        } as never,
        { transaction },
      );

      await transaction.commit();

      const createdUser = await this.userModel.findByPk(user.id, {
        attributes: { exclude: ['password'] },
        include: [
          { model: Role, as: 'role' },
          { model: Company, as: 'company' },
          { model: Role, as: 'customRoles' },
        ],
      });

      await this.auditService.log({
        action: AuditAction.CREATE,
        entity: 'User',
        entityId: user.id,
        companyId: finalCompanyId ?? undefined,
        payload: toPlainUserRecord(user),
        userId: createdByAdminId || undefined,
        description: `Se ha creado el usuario ${user.name ?? ''} ${user.lastName ?? ''}`.trim(),
      });

      await this.notificationsService.dispatch({
        type: 'system.user_created',
        title: '👤 Nuevo usuario registrado',
        body: `Se ha registrado al usuario ${user.name} ${user.lastName}`,
        companyId: finalCompanyId,
        actorUser: { id: createdByAdminId },
        extraData: { userId: user.id },
      });

      return createdUser!;
    } catch (error: unknown) {
      await transaction.rollback();
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error creando usuario: ${msg}`);
      throw error;
    }
  }

  override async findAll(adminId?: number): Promise<Users[]> {
    const where: Record<string, unknown> = {
      username: { [Op.ne]: 'superadmin' },
    };
    if (adminId) {
      where.createdByAdminId = adminId;
    }

    return this.userModel.findAll({
      where: where as WhereOptions,
      attributes: { exclude: ['password'] },
      include: [
        { model: Role, as: 'role' },
        { model: Company, as: 'company' },
      ],
    });
  }

  async findAllQuerys(
    page: number,
    pageSize: number,
    filters: { search?: string; roleId?: number; status?: string; companyId?: number },
  ): Promise<any> {
    const offset = page * pageSize;
    const limit = pageSize;
    const where = buildUsersPaginatedWhere(filters);

    const users = await this.userModel.findAndCountAll({
      where,
      offset,
      limit,
      attributes: { exclude: ['password'] },
      include: [
        { model: Role, as: 'role' },
        { model: Company, as: 'company' },
      ],
      order: [['createdAt', 'DESC']],
    });

    return {
      total: users.count,
      data: users.rows.map((user) => toPlainUserRecord(user)),
      page,
      pageSize,
    };
  }

  override async findOne(id: number): Promise<Users> {
    const user = await this.userModel.findByPk(id, {
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Role,
          as: 'role',
          include: [{ model: Permission, as: 'permissions' }],
        },
        { model: Permission, as: 'directPermissions' },
        { model: Company, as: 'company' },
      ],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return user;
  }

  async updateUser(
    userId: number,
    updateData: any,
    actorUser?: { id: number; role?: string; companyId?: number; isAdmin?: boolean },
  ): Promise<Users> {
    const transaction = await this.sequelize.transaction();
    try {
      const user = await this.userModel.findByPk(userId, { transaction });
      if (!user) {
        throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
      }

      // Validación multitenant: no modificar usuarios de otra compañía salvo superadmin
      const isSuperAdmin = actorUser?.role === 'superadmin' || (actorUser?.isAdmin && !actorUser?.companyId);
      if (!isSuperAdmin && actorUser?.companyId && user.companyId !== actorUser.companyId) {
        throw new ForbiddenException('No tienes permisos para modificar usuarios de otra compañía');
      }

      const allowedUpdates: CreateOrUpdateUserPayload = { ...updateData };
      delete allowedUpdates.password;

      if (!isSuperAdmin) {
        delete allowedUpdates.companyId; // Los admins de compañía no pueden transferir usuarios de tenant
      }

      if (
        allowedUpdates.roleId === undefined ||
        allowedUpdates.roleId === null ||
        isNaN(Number(allowedUpdates.roleId))
      ) {
        delete allowedUpdates.roleId;
      }

      // Proteger al superadmin de degradaciones accidentales
      const isTargetSuperAdmin = user.username?.toLowerCase() === 'superadmin';
      if (isTargetSuperAdmin && allowedUpdates.roleId !== undefined) {
        delete allowedUpdates.roleId;
      }

      await validateUniqueUserCredentials(
        this.userModel,
        allowedUpdates,
        transaction,
        user,
      );

      const previousRoleId = user.roleId;
      await user.update(allowedUpdates as Partial<Users>, { transaction });
      await transaction.commit();

      const updatedUser = await this.userModel.findByPk(userId, {
        attributes: { exclude: ['password'] },
        include: [
          { model: Role, as: 'role' },
          { model: Company, as: 'company' },
        ],
      });

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entity: 'User',
        entityId: userId,
        companyId: user.companyId ?? undefined,
        payload: toPlainUserRecord(updatedUser!),
        userId: actorUser?.id,
        description: `Se ha actualizado el usuario ${updatedUser!.name} ${updatedUser!.lastName}`,
      });

      if (allowedUpdates.roleId && previousRoleId !== Number(allowedUpdates.roleId)) {
        await this.notificationsService.dispatch({
          type: 'system.security_alert',
          title: '🏷️ Rol de usuario actualizado',
          body: `El rol de ${user.name} fue modificado en la plataforma.`,
          companyId: user.companyId,
          targetUserId: userId,
          actorUser: { id: actorUser?.id },
        });
      }

      return updatedUser!;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteUser(
    userId: number,
    actorUser?: { id: number; role?: string; companyId?: number; isAdmin?: boolean },
  ): Promise<void> {
    const transaction = await this.sequelize.transaction();
    try {
      const user = await this.userModel.findByPk(userId, { transaction });
      if (!user) {
        throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
      }

      if (user.username?.toLowerCase() === 'superadmin') {
        throw new ForbiddenException('No es posible desactivar al superadministrador del sistema');
      }

      const isSuperAdmin = actorUser?.role === 'superadmin' || (actorUser?.isAdmin && !actorUser?.companyId);
      if (!isSuperAdmin && actorUser?.companyId && user.companyId !== actorUser.companyId) {
        throw new ForbiddenException('No tienes permisos para desactivar usuarios de otra compañía');
      }

      const previousData = toPlainUserRecord(user);
      await user.update({ status: UserStatus.INACTIVE }, { transaction });
      await transaction.commit();

      await this.auditService.log({
        action: AuditAction.DELETE,
        entity: 'User',
        entityId: userId,
        companyId: user.companyId ?? undefined,
        payload: previousData,
        userId: actorUser?.id,
        description: `Se ha desactivado al usuario ${user.name} ${user.lastName}`,
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async findOneByEmail(userEmail: string): Promise<any> {
    return this.authProfileService.findOneByEmail(userEmail);
  }

  async findOneByUsername(username: string): Promise<any> {
    return this.authProfileService.findOneByUsername(username);
  }

  async isUserUnique(userEmail: string): Promise<boolean> {
    return this.authProfileService.isUserUnique(userEmail);
  }

  async changePassword(userId: number, newPassword: string): Promise<any> {
    return this.authProfileService.changePassword(userId, newPassword);
  }

  async getUserProfile(userId: number) {
    return this.authProfileService.getUserProfile(userId);
  }

  async updateDirectPermissions(
    userId: number,
    permissionIds: number[],
    adminUser: AdminActorContext,
  ): Promise<void> {
    return this.authProfileService.updateDirectPermissions(
      userId,
      permissionIds,
      adminUser,
    );
  }

  async createCustomRole(adminUserId: number, roleData: any): Promise<Role> {
    return this.customRolesService.createCustomRole(adminUserId, roleData);
  }

  async getUserCustomRoles(userId: number): Promise<Role[]> {
    return this.customRolesService.getUserCustomRoles(userId);
  }

  async getAllAvailableRoles(): Promise<Role[]> {
    return this.customRolesService.getAllAvailableRoles();
  }

  async updateCustomRole(adminUserId: number, roleId: number, roleData: any): Promise<Role> {
    return this.customRolesService.updateCustomRole(adminUserId, roleId, roleData);
  }

  async deleteCustomRole(adminUserId: number, roleId: number): Promise<void> {
    return this.customRolesService.deleteCustomRole(adminUserId, roleId);
  }
}
