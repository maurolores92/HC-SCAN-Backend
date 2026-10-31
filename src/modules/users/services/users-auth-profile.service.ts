import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Users } from '../users.model';
import { Role } from '../../role/role.model';
import { Company } from '../../companies/company.model';
import { Permission } from '../../permissions/permission.model';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/audit.model';
import { NotificationsService } from '../../notifications/notifications.service';
import { DEPRECATED_PLATFORM_PERMISSIONS } from '../../seeders/data/permissions.data';
import { mapUserWithMergedPermissions } from '../helpers/users-query.helper';
import {
  isPlatformSuperAdmin,
  requireTenantCompanyId,
} from '../../../common/utils/tenant-scope.util';

export interface AdminActorContext {
  id?: number;
  role?: string;
  isAdmin?: boolean;
  companyId?: number;
  permissions?: string[];
}

@Injectable()
export class UsersAuthProfileService {
  constructor(
    @InjectModel(Users) private readonly userModel: typeof Users,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findOneByEmail(userEmail: string): Promise<any> {
    const user = await this.userModel.findOne({
      where: { email: userEmail },
      include: [
        { model: Role, as: 'role', include: [{ model: Permission }] },
        { model: Permission, as: 'directPermissions' },
        { model: Company, as: 'company' },
      ],
    });

    if (!user) {
      throw new BadRequestException(
        `Usuario con email: ${userEmail} no encontrado`,
      );
    }

    return mapUserWithMergedPermissions(user, false);
  }

  async findOneByUsername(username: string): Promise<any> {
    const user = await this.userModel.findOne({
      where: { username },
      include: [
        { model: Role, as: 'role', include: [{ model: Permission }] },
        { model: Permission, as: 'directPermissions' },
        { model: Company, as: 'company' },
      ],
    });

    if (!user) {
      throw new BadRequestException(
        `Usuario con username: ${username} no encontrado`,
      );
    }

    return mapUserWithMergedPermissions(user, true);
  }

  async isUserUnique(userEmail: string): Promise<boolean> {
    const user = await this.userModel.findOne({
      where: { email: userEmail.toLowerCase() },
    });

    return user == null;
  }

  async changePassword(
    userId: number,
    newPassword: string,
    actorUser?: AdminActorContext,
  ): Promise<any> {
    const user = await this.userModel.findByPk(userId, {
      include: [{ model: Role, as: 'role', attributes: ['slug'] }],
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (actorUser) {
      const isSelf = Number(actorUser.id) === Number(userId);
      if (!isSelf) {
        if (isPlatformSuperAdmin(actorUser)) {
          throw new ForbiddenException(
            'El Super Administrador no modifica contraseñas de usuarios de compañías.',
          );
        }

        const canUpdateUser =
          actorUser.isAdmin === true ||
          actorUser.role === 'company_admin' ||
          (Array.isArray(actorUser.permissions) &&
            actorUser.permissions.includes('UPDATE_USER'));

        if (!canUpdateUser) {
          throw new ForbiddenException(
            'No posees permisos para cambiar la contraseña de otro usuario.',
          );
        }

        const tenantCompanyId = requireTenantCompanyId(actorUser);
        const isTargetSuperAdmin =
          String(user.username || '').toLowerCase() === 'superadmin' ||
          user.role?.slug === 'superadmin';

        if (isTargetSuperAdmin || user.companyId !== tenantCompanyId) {
          throw new ForbiddenException(
            'No tienes permiso para cambiar la contraseña de un usuario de otra compañía.',
          );
        }
      }
    }

    const hashedPassword = await Users.hashPassword(newPassword);
    user.password = hashedPassword;
    await user.save();

    if (user.companyId) {
      await this.notificationsService.dispatch({
        type: 'system.security_alert',
        title: '🔑 Contraseña actualizada',
        body: 'Tu contraseña ha sido cambiada exitosamente.',
        targetUserId: userId,
        companyId: user.companyId,
      });
    }

    return { message: 'Contraseña actualizada exitosamente' };
  }

  async getUserProfile(userId: number) {
    const userWithRole = await this.userModel.findByPk(userId, {
      include: [
        { model: Role, as: 'role' },
        { model: Role, as: 'customRoles' },
        { model: Company, as: 'company' },
      ],
      attributes: { exclude: ['password'] },
    });

    if (!userWithRole) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return {
      user: {
        id: userWithRole.id,
        name: userWithRole.name,
        lastName: userWithRole.lastName,
        email: userWithRole.email,
        username: userWithRole.username,
        companyId: userWithRole.companyId,
        company: userWithRole.company ? userWithRole.company.toJSON() : null,
        role: userWithRole.role?.slug || null,
        roleId: userWithRole.roleId,
        isAdmin: userWithRole.isAdmin,
        image: userWithRole.image || null,
        document: userWithRole.document || null,
        customRoles: userWithRole.customRoles || [],
      },
    };
  }

  async updateDirectPermissions(
    userId: number,
    permissionIds: number[],
    adminUser: AdminActorContext,
  ): Promise<void> {
    if (isPlatformSuperAdmin(adminUser)) {
      throw new ForbiddenException(
        'El Super Administrador no gestiona permisos directos de usuarios de compañías.',
      );
    }

    const tenantCompanyId = requireTenantCompanyId(adminUser);
    const user = await this.userModel.findByPk(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (
      String(user.username || '').toLowerCase() === 'superadmin' ||
      user.companyId !== tenantCompanyId
    ) {
      throw new ForbiddenException(
        'No tienes permiso para modificar usuarios de otra compañía.',
      );
    }

    const requestedPermissions = await Permission.findAll({
      where: { id: permissionIds },
    });
    const requestedNames = requestedPermissions.map((p) => p.name);

    const hasPlatformPerm = requestedNames.some((name) =>
      DEPRECATED_PLATFORM_PERMISSIONS.includes(name),
    );
    if (hasPlatformPerm) {
      throw new ForbiddenException(
        'No se permiten asignar permisos reservados de plataforma.',
      );
    }

    const isCompanyAdmin =
      adminUser?.isAdmin === true || adminUser?.role === 'company_admin';

    if (!isCompanyAdmin) {
      const adminPermissions: string[] = Array.isArray(adminUser?.permissions)
        ? adminUser.permissions
        : [];
      const isValid = requestedNames.every((name) =>
        adminPermissions.includes(name),
      );
      if (!isValid) {
        throw new ForbiddenException(
          'No puedes delegar permisos o módulos que no posees.',
        );
      }
    }

    await user.$set('directPermissions', permissionIds);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: userId,
      companyId: tenantCompanyId,
      payload: { directPermissions: permissionIds },
      userId: adminUser?.id,
      description: `Se han actualizado las excepciones de permisos del usuario ${user.name}`,
    });
  }
}
