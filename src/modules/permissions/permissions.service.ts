import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Permission } from './permission.model';
import { Role } from '../role/role.model';
import { DEPRECATED_PLATFORM_PERMISSIONS } from '../seeders/data/permissions.data';
import { isPlatformSuperAdmin } from '../../common/utils/tenant-scope.util';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectModel(Permission)
    private permissionModel: typeof Permission,
  ) {}

  async findAll(user?: any): Promise<Permission[]> {
    const superAdmin = isPlatformSuperAdmin(user);

    const allPermissions = await this.permissionModel.findAll({
      where: {
        name: { [Op.notIn]: DEPRECATED_PLATFORM_PERMISSIONS },
      },
      include: superAdmin
        ? [
            {
              model: Role,
              where: { companyId: null },
              required: false,
            },
          ]
        : [],
      order: [
        ['categoria', 'ASC'],
        ['id', 'ASC'],
      ],
    });

    if (!superAdmin && user) {
      if (user.isAdmin === true || user.role === 'company_admin') {
        return allPermissions;
      }
      const userPermissions: string[] = Array.isArray(user.permissions)
        ? user.permissions
        : [];
      return allPermissions.filter((p) => userPermissions.includes(p.name));
    }

    return allPermissions;
  }

  async updatePermissionRoles(
    permissionId: number,
    roleIds: number[],
    description?: string,
    displayName?: string,
  ): Promise<Permission> {
    const permission = await this.permissionModel.findByPk(permissionId, {
      include: [Role],
    });
    if (!permission) {
      throw new NotFoundException(
        `Permiso con id ${permissionId} no encontrado`,
      );
    }

    let changed = false;
    if (description !== undefined) {
      permission.description = description;
      changed = true;
    }
    if (displayName !== undefined) {
      permission.displayName = displayName;
      changed = true;
    }

    if (changed) {
      await permission.save();
    }

    // Preservar asignaciones de roles personalizados de compañías (companyId !== null)
    const existingTenantRoleIds = Array.isArray(permission.roles)
      ? permission.roles
          .filter((r) => r.companyId !== null && r.companyId !== undefined)
          .map((r) => r.id)
      : [];

    const validGlobalRoles = await Role.findAll({
      where: {
        id: { [Op.in]: roleIds || [] },
        companyId: null,
      },
      attributes: ['id'],
    });
    const globalRoleIds = validGlobalRoles.map((r) => r.id);

    const mergedRoleIds = Array.from(
      new Set([...globalRoleIds, ...existingTenantRoleIds]),
    );
    await permission.$set('roles', mergedRoleIds);

    return this.permissionModel.findByPk(permissionId, {
      include: [{ model: Role, where: { companyId: null }, required: false }],
    }) as Promise<Permission>;
  }
}
