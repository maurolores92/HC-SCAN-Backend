import * as bcrypt from 'bcrypt';
import { Sequelize } from 'sequelize-typescript';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from '../../role/role.model';
import { Company } from '../../companies/company.model';
import { Users, UserStatus } from '../users.model';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/audit.model';
import { NotificationsService } from '../../notifications/notifications.service';
import { TenantQuotasService } from '../../plans/services/tenant-quotas.service';
import {
  toPlainUserRecord,
  validateUniqueUserCredentials,
} from '../helpers/users-query.helper';
import {
  isPlatformSuperAdmin,
  requireTenantCompanyId,
} from '../../../common/utils/tenant-scope.util';

const TENANT_BASE_ROLE_SLUGS = ['company_admin', 'user'];

export interface CreateOrUpdateUserPayload {
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

/**
 * Sub-servicio modular encargado del alta, edición, reactivación y baja lógica de usuarios,
 * aplicando aislamiento multitenant estricto y las cuotas del plan contratado (`TenantQuotasService`).
 */
@Injectable()
export class UsersLifecycleService {
  private readonly logger = new Logger(UsersLifecycleService.name);

  constructor(
    @InjectModel(Users) private readonly userModel: typeof Users,
    private readonly sequelize: Sequelize,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly tenantQuotasService: TenantQuotasService,
  ) {}

  private assertRoleAllowedForCompany(role: Role, companyId: number): void {
    if (role.slug === 'superadmin') {
      throw new ForbiddenException('No está permitido asignar el rol superadministrador.');
    }

    const isBaseRole =
      role.companyId === null && TENANT_BASE_ROLE_SLUGS.includes(role.slug);
    const isOwnCompanyRole = role.companyId === companyId;

    if (!isBaseRole && !isOwnCompanyRole) {
      throw new ForbiddenException(
        'El rol seleccionado no pertenece a su compañía.',
      );
    }
  }

  async createUser(
    data: CreateOrUpdateUserPayload,
    createdByAdminId?: number,
    adminCompanyId?: number,
  ): Promise<Users> {
    if (!adminCompanyId || adminCompanyId <= 0) {
      throw new ForbiddenException(
        'Solo una compañía activa puede dar de alta usuarios operativos.',
      );
    }

    const transaction = await this.sequelize.transaction();
    try {
      const { roleId, password, companyId: _ignoredCompanyId, isAdmin: _ignoredIsAdmin, ...userData } = data;

      if (String(userData.username || '').toLowerCase().trim() === 'superadmin') {
        throw new BadRequestException('El nombre de usuario está reservado.');
      }

      await validateUniqueUserCredentials(
        this.userModel,
        { email: String(userData.email || ''), username: userData.username },
        transaction,
      );

      let finalRoleId: number | null = null;
      let derivedIsAdmin = false;

      if (roleId) {
        const role = await Role.findByPk(Number(roleId), { transaction });
        if (!role) {
          throw new BadRequestException('El rol especificado no existe');
        }
        this.assertRoleAllowedForCompany(role, adminCompanyId);
        finalRoleId = Number(roleId);
        derivedIsAdmin = role.slug === 'company_admin';
      }

      await this.tenantQuotasService.assertCanCreateOrActivateUser(
        Number(adminCompanyId),
        transaction,
      );

      const hashedPassword = await bcrypt.hash(String(password || ''), 10);

      const user = await this.userModel.create(
        {
          ...userData,
          password: hashedPassword,
          roleId: finalRoleId,
          companyId: adminCompanyId,
          isAdmin: derivedIsAdmin,
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
        companyId: adminCompanyId,
        payload: toPlainUserRecord(user),
        userId: createdByAdminId || undefined,
        description: `Se ha creado el usuario ${user.name ?? ''} ${user.lastName ?? ''}`.trim(),
      });

      await this.notificationsService.dispatch({
        type: 'system.user_created',
        title: '👤 Nuevo usuario registrado',
        body: `Se ha registrado al usuario ${user.name} ${user.lastName}`,
        companyId: adminCompanyId,
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

  async updateUser(
    userId: number,
    updateData: CreateOrUpdateUserPayload,
    actorUser?: {
      id: number;
      role?: string;
      companyId?: number;
      isAdmin?: boolean;
      permissions?: string[];
    },
  ): Promise<Users> {
    const transaction = await this.sequelize.transaction();
    try {
      const user = await this.userModel.findByPk(userId, { transaction });
      if (!user) {
        throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
      }

      const isSelfEdit = Boolean(actorUser && Number(actorUser.id) === Number(userId));
      const actorIsSuperAdmin = isPlatformSuperAdmin(actorUser);
      const isTargetSuperAdmin = user.username?.toLowerCase() === 'superadmin';

      if (actorIsSuperAdmin && !isSelfEdit) {
        throw new ForbiddenException(
          'El Super Administrador no modifica usuarios internos de compañías.',
        );
      }

      const canManageCompanyUsers =
        !actorIsSuperAdmin &&
        Boolean(
          actorUser?.isAdmin === true ||
            actorUser?.role === 'company_admin' ||
            (Array.isArray(actorUser?.permissions) &&
              actorUser?.permissions.includes('UPDATE_USER')),
        );

      if (!isSelfEdit && !canManageCompanyUsers) {
        throw new ForbiddenException('No posees permisos para modificar otros usuarios.');
      }

      if (!actorIsSuperAdmin) {
        const tenantCompanyId = requireTenantCompanyId(actorUser);
        if (isTargetSuperAdmin || user.companyId !== tenantCompanyId) {
          throw new ForbiddenException(
            'No tienes permisos para modificar usuarios de otra compañía.',
          );
        }
      }

      const allowedUpdates: CreateOrUpdateUserPayload = { ...updateData };
      delete allowedUpdates.password;
      delete allowedUpdates.companyId;
      delete allowedUpdates.isAdmin;

      if (!canManageCompanyUsers || isTargetSuperAdmin) {
        delete allowedUpdates.roleId;
        delete allowedUpdates.status;
      }

      if (
        allowedUpdates.roleId === undefined ||
        allowedUpdates.roleId === null ||
        isNaN(Number(allowedUpdates.roleId))
      ) {
        delete allowedUpdates.roleId;
      } else if (user.companyId) {
        const nextRole = await Role.findByPk(Number(allowedUpdates.roleId), { transaction });
        if (!nextRole) {
          throw new BadRequestException('El rol especificado no existe.');
        }
        this.assertRoleAllowedForCompany(nextRole, user.companyId);
        allowedUpdates.isAdmin = nextRole.slug === 'company_admin';
      }

      if (
        allowedUpdates.status === UserStatus.ACTIVE &&
        user.status === UserStatus.INACTIVE &&
        user.companyId
      ) {
        await this.tenantQuotasService.assertCanCreateOrActivateUser(
          user.companyId,
          transaction,
        );
      }

      await validateUniqueUserCredentials(this.userModel, allowedUpdates, transaction, user);

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

      if (
        user.companyId &&
        allowedUpdates.roleId &&
        previousRoleId !== Number(allowedUpdates.roleId)
      ) {
        await this.notificationsService.dispatch({
          type: 'system.security_alert',
          title: '🏷️ Rol de usuario actualizado',
          body: `El rol de ${user.name} fue modificado.`,
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

  async deactivateUser(
    userId: number,
    actorUser?: { id: number; role?: string; companyId?: number; isAdmin?: boolean },
  ): Promise<void> {
    if (isPlatformSuperAdmin(actorUser)) {
      throw new ForbiddenException(
        'El Super Administrador no desactiva usuarios individuales de compañías.',
      );
    }

    const tenantCompanyId = requireTenantCompanyId(actorUser);
    const transaction = await this.sequelize.transaction();
    try {
      const user = await this.userModel.findByPk(userId, { transaction });
      if (!user) {
        throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
      }

      if (user.username?.toLowerCase() === 'superadmin') {
        throw new ForbiddenException('No es posible desactivar al superadministrador del sistema');
      }

      if (user.companyId !== tenantCompanyId) {
        throw new ForbiddenException('No tienes permisos para desactivar usuarios de otra compañía');
      }

      const previousData = toPlainUserRecord(user);
      await user.update({ status: UserStatus.INACTIVE }, { transaction });
      await transaction.commit();

      await this.auditService.log({
        action: AuditAction.DELETE,
        entity: 'User',
        entityId: userId,
        companyId: tenantCompanyId,
        payload: previousData,
        userId: actorUser?.id,
        description: `Se ha desactivado al usuario ${user.name} ${user.lastName}`,
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
