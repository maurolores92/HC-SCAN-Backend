import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Permission } from './permission.model';
import { Role } from '../role/role.model';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectModel(Permission)
    private permissionModel: typeof Permission,
  ) {}

  async findAll(user?: any): Promise<Permission[]> {
    const allPermissions = await this.permissionModel.findAll({
      include: [Role],
    });

    if (user && user.role !== 'superadmin') {
      const userPermissions = user.permissions || [];
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
    const permission = await this.permissionModel.findByPk(permissionId);
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

    // Actualizar la tabla intermedia RolePermission
    // Sequelize asocia los modelos belongsToMany usando $set
    await permission.$set('roles', roleIds);

    // Retornar el permiso actualizado con sus roles
    return this.permissionModel.findByPk(permissionId, {
      include: [Role],
    }) as Promise<Permission>;
  }
}
