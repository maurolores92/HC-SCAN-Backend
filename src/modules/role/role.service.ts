import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CrudService } from '../../common/crud/crud.service';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from './role.model';
import { Op } from 'sequelize';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.model';
import { NotificationsService } from '../notifications/notifications.service';
import { Permission } from '../permissions/permission.model';
import { Users, UserStatus } from '../users/users.model';
import { RolePermission } from '../permissions/role-permission/role-permission.model';

export const SYSTEM_ROLE_SLUGS = ['superadmin', 'company_admin', 'user'];

@Injectable()
export class RoleService extends CrudService<Role> {
  constructor(
    @InjectModel(Role) private readonly roleModel: typeof Role,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {
    super(roleModel);
  }

  override async create(data: any, user?: any): Promise<Role> {
    const { permissions, ...roleData } = data;

    if (
      user &&
      user.role !== 'superadmin' &&
      permissions &&
      Array.isArray(permissions) &&
      permissions.length > 0
    ) {
      await this.validatePermissionsLimit(user, permissions);
    }

    // Multitenancy: si no es superadmin, asociar rol a la compañía del usuario
    if (user && user.role !== 'superadmin' && user.companyId) {
      roleData.companyId = user.companyId;
    }

    const role = await super.create(roleData);
    if (permissions && Array.isArray(permissions)) {
      await role.$set('permissions', permissions);
    }

    await this.auditService.log({
      action: AuditAction.CREATE,
      entity: 'Role',
      entityId: role.id,
      companyId: role.companyId ?? user?.companyId,
      payload: role.toJSON(),
      userId: user?.id || data.userId || undefined,
      description: `Se ha creado el rol "${role.name ?? role.id}"`,
    });

    await this.notificationsService.dispatch({
      type: 'system.security_alert',
      title: '🚨 Nuevo rol configurado',
      body: `Se ha creado el rol "${role.name}".`,
      actorUser: { id: user?.id || data.userId },
      extraData: { roleId: role.id, companyId: role.companyId },
    });

    return this.findOne(role.id);
  }

  override async update(id: number, data: any, user?: any): Promise<Role> {
    const oldRole = await this.findOne(id);
    if (!oldRole) throw new ForbiddenException('El rol no existe.');

    if (oldRole.slug === 'superadmin') {
      throw new ForbiddenException(
        'No puedes modificar el rol superadministrador.',
      );
    }

    // Si es un rol protegido del sistema, proteger nombre y slug
    if (SYSTEM_ROLE_SLUGS.includes(oldRole.slug)) {
      delete data.name;
      delete data.slug;
    }

    // Multitenant: verificar que no modifique roles de otra compañía
    if (
      user &&
      user.role !== 'superadmin' &&
      oldRole.companyId &&
      oldRole.companyId !== user.companyId
    ) {
      throw new ForbiddenException('No tienes permiso para modificar este rol.');
    }

    const { permissions, ...roleData } = data;

    if (
      user &&
      user.role !== 'superadmin' &&
      permissions &&
      Array.isArray(permissions)
    ) {
      await this.validatePermissionsLimit(user, permissions);
    }

    const updatedRole = await super.update(id, roleData);

    if (permissions && Array.isArray(permissions)) {
      await updatedRole.$set('permissions', permissions);
    }

    const finalRole = await this.findOne(id);
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entity: 'Role',
      entityId: id,
      companyId: finalRole.companyId ?? user?.companyId,
      payload: finalRole.toJSON(),
      userId: user?.id || data.userId || undefined,
      description: `Se ha actualizado el rol "${finalRole.name ?? id}"`,
    });

    return finalRole;
  }

  override async delete(id: number, user?: any): Promise<void> {
    const oldRole = await this.findOne(id);
    if (!oldRole) return;

    if (SYSTEM_ROLE_SLUGS.includes(oldRole.slug)) {
      throw new ForbiddenException(
        'No puedes eliminar un rol predeterminado del sistema.',
      );
    }

    if (
      user &&
      user.role !== 'superadmin' &&
      oldRole.companyId &&
      oldRole.companyId !== user.companyId
    ) {
      throw new ForbiddenException('No tienes permiso para eliminar este rol.');
    }

    const previousData = oldRole.toJSON();

    const [affectedUsersCount] = await Users.update(
      { roleId: null },
      { where: { roleId: id } },
    );

    await RolePermission.destroy({ where: { roleId: id } });
    await super.delete(id);

    await this.auditService.log({
      action: AuditAction.DELETE,
      entity: 'Role',
      entityId: id,
      companyId: oldRole.companyId ?? user?.companyId,
      payload: { ...previousData, unassignedUsersCount: affectedUsersCount },
      userId: user?.id,
      description: `Se ha eliminado el rol "${previousData.name ?? id}".`,
    });
  }

  override async findAll(user?: any): Promise<any[]> {
    const whereClause: any = { slug: { [Op.ne]: 'superadmin' } };

    if (user && user.role !== 'superadmin' && user.companyId) {
      whereClause[Op.or] = [
        { companyId: null },
        { companyId: user.companyId },
      ];
    }

    const roles = await this.roleModel.findAll({
      where: whereClause,
      include: [Permission],
      order: [['id', 'ASC']],
    });

    const results: any[] = [];
    for (const role of roles) {
      const userCountWhere: any = {
        roleId: role.id,
        status: { [Op.ne]: UserStatus.INACTIVE },
      };

      if (user && user.role !== 'superadmin' && user.companyId) {
        userCountWhere.companyId = user.companyId;
      }

      const usersCount = await Users.count({ where: userCountWhere });
      const roleData = role.toJSON();
      roleData.usersCount = usersCount;
      results.push(roleData);
    }
    return results;
  }

  override async findOne(id: number): Promise<Role> {
    return this.roleModel.findByPk(id, {
      include: [Permission],
    }) as Promise<Role>;
  }

  async findEditableRoles(user?: any): Promise<any[]> {
    const whereClause: any = { slug: { [Op.ne]: 'superadmin' } };

    if (user && user.role !== 'superadmin' && user.companyId) {
      whereClause[Op.or] = [
        { companyId: null },
        { companyId: user.companyId },
      ];
    }

    const roles = await this.roleModel.findAll({
      where: whereClause,
    });

    const results: any[] = [];
    for (const role of roles) {
      const userCountWhere: any = {
        roleId: role.id,
        status: { [Op.ne]: UserStatus.INACTIVE },
      };

      if (user && user.role !== 'superadmin' && user.companyId) {
        userCountWhere.companyId = user.companyId;
      }

      const usersCount = await Users.count({ where: userCountWhere });
      const roleData = role.toJSON();
      roleData.usersCount = usersCount;
      results.push(roleData);
    }
    return results;
  }

  private async validatePermissionsLimit(
    user: any,
    requestedPermissionIds: number[],
  ) {
    if (!requestedPermissionIds || requestedPermissionIds.length === 0) return;

    const requestedPermissions = await Permission.findAll({
      where: { id: requestedPermissionIds },
    });

    const requestedNames = requestedPermissions.map((p) => p.name);
    const userPermissions = user.permissions || [];

    const isValid = requestedNames.every((name) =>
      userPermissions.includes(name),
    );

    if (user.role !== 'superadmin' && !isValid) {
      throw new ForbiddenException(
        'No puedes delegar permisos de módulos o acciones que no posees.',
      );
    }
  }
}
