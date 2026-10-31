import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
import { DEPRECATED_PLATFORM_PERMISSIONS } from '../seeders/data/permissions.data';
import {
  isPlatformSuperAdmin,
  requireTenantCompanyId,
} from '../../common/utils/tenant-scope.util';

export const SYSTEM_ROLE_SLUGS = ['superadmin', 'company_admin', 'user'];
const TENANT_BASE_ROLE_SLUGS = ['company_admin', 'user'];
const RESERVED_ROLE_SLUGS = ['superadmin', 'company_admin', 'admin', 'user'];

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
    if (isPlatformSuperAdmin(user)) {
      throw new ForbiddenException(
        'El Super Administrador no crea roles operativos de compañías.',
      );
    }

    const tenantCompanyId = requireTenantCompanyId(user);
    const { permissions, ...roleData } = data;

    const normalizedSlug = String(roleData.slug || roleData.name || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-');

    if (!normalizedSlug || RESERVED_ROLE_SLUGS.includes(normalizedSlug)) {
      throw new BadRequestException(
        'El nombre o identificador del rol está reservado por el sistema.',
      );
    }

    const duplicate = await this.roleModel.findOne({
      where: { companyId: tenantCompanyId, slug: normalizedSlug },
    });
    if (duplicate) {
      throw new BadRequestException(
        `Ya existe un rol "${roleData.name || normalizedSlug}" en su compañía.`,
      );
    }

    if (Array.isArray(permissions) && permissions.length > 0) {
      await this.validatePermissionsLimit(user, permissions);
    }

    const role = await super.create({
      ...roleData,
      slug: normalizedSlug,
      companyId: tenantCompanyId,
      userId: user?.id ?? null,
    });

    if (Array.isArray(permissions)) {
      await role.$set('permissions', permissions);
    }

    await this.auditService.log({
      action: AuditAction.CREATE,
      entity: 'Role',
      entityId: role.id,
      companyId: tenantCompanyId,
      payload: role.toJSON(),
      userId: user?.id,
      description: `Se ha creado el rol "${role.name ?? role.id}"`,
    });

    await this.notificationsService.dispatch({
      type: 'system.security_alert',
      title: '🚨 Nuevo rol configurado',
      body: `Se ha creado el rol "${role.name}".`,
      companyId: tenantCompanyId,
      actorUser: { id: user?.id },
      extraData: { roleId: role.id, companyId: tenantCompanyId },
    });

    return this.findOne(role.id, user);
  }

  override async update(id: number, data: any, user?: any): Promise<Role> {
    if (isPlatformSuperAdmin(user)) {
      throw new ForbiddenException(
        'El Super Administrador administra permisos globales desde el catálogo de permisos.',
      );
    }

    const tenantCompanyId = requireTenantCompanyId(user);
    const oldRole = await this.roleModel.findByPk(id, { include: [Permission] });
    if (!oldRole) {
      throw new NotFoundException('El rol solicitado no existe.');
    }

    if (!oldRole.companyId || SYSTEM_ROLE_SLUGS.includes(oldRole.slug)) {
      throw new ForbiddenException(
        'Los roles base predeterminados del sistema son de solo lectura.',
      );
    }

    if (oldRole.companyId !== tenantCompanyId) {
      throw new ForbiddenException('No tienes permiso para modificar este rol.');
    }

    const { permissions, ...roleData } = data;
    delete roleData.companyId;
    delete roleData.userId;

    if (roleData.name || roleData.slug) {
      const nextSlug = String(roleData.slug || roleData.name)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-');
      if (RESERVED_ROLE_SLUGS.includes(nextSlug)) {
        throw new BadRequestException('El nombre del rol está reservado por el sistema.');
      }
      const duplicate = await this.roleModel.findOne({
        where: {
          companyId: tenantCompanyId,
          slug: nextSlug,
          id: { [Op.ne]: id },
        },
      });
      if (duplicate) {
        throw new BadRequestException('Ya existe otro rol con ese nombre en su compañía.');
      }
      roleData.slug = nextSlug;
    }

    if (Array.isArray(permissions)) {
      await this.validatePermissionsLimit(user, permissions);
    }

    const updatedRole = await super.update(id, roleData);
    if (Array.isArray(permissions)) {
      await updatedRole.$set('permissions', permissions);
    }

    const finalRole = await this.findOne(id, user);
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entity: 'Role',
      entityId: id,
      companyId: tenantCompanyId,
      payload: finalRole.toJSON(),
      userId: user?.id,
      description: `Se ha actualizado el rol "${finalRole.name ?? id}"`,
    });

    return finalRole;
  }

  override async delete(id: number, user?: any): Promise<void> {
    if (isPlatformSuperAdmin(user)) {
      throw new ForbiddenException(
        'El Super Administrador no elimina roles operativos de compañías.',
      );
    }

    const tenantCompanyId = requireTenantCompanyId(user);
    const oldRole = await this.roleModel.findByPk(id);
    if (!oldRole) {
      throw new NotFoundException('El rol solicitado no existe.');
    }

    if (!oldRole.companyId || SYSTEM_ROLE_SLUGS.includes(oldRole.slug)) {
      throw new ForbiddenException(
        'No puedes eliminar un rol base predeterminado del sistema.',
      );
    }

    if (oldRole.companyId !== tenantCompanyId) {
      throw new ForbiddenException('No tienes permiso para eliminar este rol.');
    }

    const previousData = oldRole.toJSON();
    const [affectedUsersCount] = await Users.update(
      { roleId: null },
      { where: { roleId: id, companyId: tenantCompanyId } },
    );

    await RolePermission.destroy({ where: { roleId: id } });
    await super.delete(id);

    await this.auditService.log({
      action: AuditAction.DELETE,
      entity: 'Role',
      entityId: id,
      companyId: tenantCompanyId,
      payload: { ...previousData, unassignedUsersCount: affectedUsersCount },
      userId: user?.id,
      description: `Se ha eliminado el rol "${previousData.name ?? id}".`,
    });
  }

  override async findAll(user?: any): Promise<any[]> {
    return this.queryScopedRoles(user, true);
  }

  async findEditableRoles(user?: any): Promise<any[]> {
    return this.queryScopedRoles(user, false);
  }

  override async findOne(id: number, user?: any): Promise<Role> {
    const role = await this.roleModel.findByPk(id, {
      include: [Permission],
    });

    if (!role) {
      throw new NotFoundException('Rol no encontrado.');
    }

    if (user) {
      if (isPlatformSuperAdmin(user)) {
        if (role.companyId !== null || !TENANT_BASE_ROLE_SLUGS.includes(role.slug)) {
          throw new ForbiddenException('Acceso denegado a rol personalizado de compañía.');
        }
      } else {
        const tenantCompanyId = requireTenantCompanyId(user);
        const isBaseRole =
          role.companyId === null && TENANT_BASE_ROLE_SLUGS.includes(role.slug);
        const isOwnCompanyRole = role.companyId === tenantCompanyId;

        if (!isBaseRole && !isOwnCompanyRole) {
          throw new ForbiddenException('No tienes permiso para consultar este rol.');
        }
      }
    }

    return role;
  }

  private async queryScopedRoles(user: any, includePermissions: boolean): Promise<any[]> {
    if (isPlatformSuperAdmin(user)) {
      const baseRoles = await this.roleModel.findAll({
        where: {
          companyId: null,
          slug: { [Op.in]: TENANT_BASE_ROLE_SLUGS },
        },
        include: includePermissions ? [Permission] : [],
        order: [['id', 'ASC']],
      });
      return baseRoles.map((r) => ({ ...r.toJSON(), usersCount: 0 }));
    }

    const tenantCompanyId = requireTenantCompanyId(user);
    const roles = await this.roleModel.findAll({
      where: {
        slug: { [Op.ne]: 'superadmin' },
        [Op.or]: [
          { companyId: null, slug: { [Op.in]: TENANT_BASE_ROLE_SLUGS } },
          { companyId: tenantCompanyId },
        ],
      },
      include: includePermissions ? [Permission] : [],
      order: [['id', 'ASC']],
    });

    const results: any[] = [];
    for (const role of roles) {
      const usersCount = await Users.count({
        where: {
          roleId: role.id,
          companyId: tenantCompanyId,
          username: { [Op.ne]: 'superadmin' },
          status: { [Op.ne]: UserStatus.INACTIVE },
        },
      });
      results.push({ ...role.toJSON(), usersCount });
    }
    return results;
  }

  private async validatePermissionsLimit(
    user: any,
    requestedPermissionIds: number[],
  ): Promise<void> {
    if (!requestedPermissionIds || requestedPermissionIds.length === 0) return;

    const requestedPermissions = await Permission.findAll({
      where: { id: requestedPermissionIds },
    });

    const requestedNames = requestedPermissions.map((p) => p.name);
    if (requestedNames.some((name) => DEPRECATED_PLATFORM_PERMISSIONS.includes(name))) {
      throw new ForbiddenException(
        'No se permiten asignar permisos reservados de plataforma.',
      );
    }

    if (user?.role === 'company_admin' || user?.isAdmin === true) {
      return;
    }

    const userPermissions: string[] = Array.isArray(user?.permissions)
      ? user.permissions
      : [];
    const isValid = requestedNames.every((name) => userPermissions.includes(name));
    if (!isValid) {
      throw new ForbiddenException(
        'No puedes delegar permisos de módulos o acciones que no posees.',
      );
    }
  }
}
