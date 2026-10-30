import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { Role } from '../../role/role.model';
import { Users } from '../users.model';
import { RolePermission } from '../../permissions/role-permission/role-permission.model';

/**
 * @service UsersCustomRolesService
 * Administra la creación, modificación, asignación y baja de roles personalizados
 * creados por usuarios administradores.
 */
@Injectable()
export class UsersCustomRolesService {
  constructor(
    @InjectModel(Users)
    private readonly userModel: typeof Users,
    private readonly sequelize: Sequelize,
  ) {}

  /**
   * Crea un nuevo rol personalizado asignado a un administrador.
   */
  async createCustomRole(adminUserId: number, roleData: any): Promise<Role> {
    const transaction = await this.sequelize.transaction();
    try {
      const admin = await this.userModel.findByPk(adminUserId, { transaction });
      if (!admin || !admin.isAdmin) {
        throw new BadRequestException(
          'Solo los usuarios admin pueden crear roles',
        );
      }

      const existingRole = await Role.findOne({
        where: { slug: roleData.slug, userId: adminUserId },
        transaction,
      });
      if (existingRole) {
        throw new BadRequestException('Ya existe un rol con este slug');
      }

      const newRole = await Role.create(
        {
          ...roleData,
          userId: adminUserId,
        },
        { transaction },
      );

      await transaction.commit();
      return newRole;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Obtiene los roles personalizados creados por un usuario.
   */
  async getUserCustomRoles(userId: number): Promise<Role[]> {
    return Role.findAll({
      where: { userId },
    });
  }

  /**
   * Obtiene todos los roles globales disponibles en el sistema (sin superadmin).
   */
  async getAllAvailableRoles(): Promise<Role[]> {
    return Role.findAll({
      where: {
        userId: null,
        slug: { [Op.ne]: 'superadmin' },
      },
    });
  }

  /**
   * Modifica los datos de un rol personalizado existente.
   */
  async updateCustomRole(
    adminUserId: number,
    roleId: number,
    roleData: any,
  ): Promise<Role> {
    const transaction = await this.sequelize.transaction();
    try {
      const role = await Role.findByPk(roleId, { transaction });
      if (!role) {
        throw new NotFoundException('Rol no encontrado');
      }

      if (role.userId !== adminUserId) {
        throw new BadRequestException('No tienes permiso para editar este rol');
      }

      if (roleData.slug && roleData.slug !== role.slug) {
        const existingRole = await Role.findOne({
          where: { slug: roleData.slug, userId: adminUserId },
          transaction,
        });
        if (existingRole) {
          throw new BadRequestException('Ya existe un rol con este slug');
        }
      }

      await role.update(roleData, { transaction });
      await transaction.commit();
      return role;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Da de baja un rol personalizado si no tiene usuarios activos asignados.
   */
  async deleteCustomRole(adminUserId: number, roleId: number): Promise<void> {
    const transaction = await this.sequelize.transaction();
    try {
      const role = await Role.findByPk(roleId, { transaction });
      if (!role) {
        throw new NotFoundException('Rol no encontrado');
      }

      if (role.userId !== adminUserId) {
        throw new BadRequestException(
          'No tienes permiso para eliminar este rol',
        );
      }

      // Desasociar el rol de los usuarios asignados (pasan a no tener rol)
      await this.userModel.update(
        { roleId: null },
        { where: { roleId }, transaction },
      );

      // Limpiar permisos del rol
      await RolePermission.destroy({ where: { roleId }, transaction });

      await role.destroy({ transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
