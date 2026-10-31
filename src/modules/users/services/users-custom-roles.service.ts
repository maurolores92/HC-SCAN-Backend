import {
  Injectable,
  BadRequestException,
  ForbiddenException,
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
 * Administra la creación, modificación, consulta y baja de roles personalizados
 * aislados estrictamente por `companyId`.
 */
@Injectable()
export class UsersCustomRolesService {
  constructor(
    @InjectModel(Users)
    private readonly userModel: typeof Users,
    private readonly sequelize: Sequelize,
  ) {}

  async createCustomRole(
    adminUserId: number,
    roleData: any,
    companyId: number,
  ): Promise<Role> {
    const transaction = await this.sequelize.transaction();
    try {
      const admin = await this.userModel.findByPk(adminUserId, { transaction });
      if (!admin || admin.companyId !== companyId) {
        throw new ForbiddenException('Acceso denegado a otra compañía.');
      }

      const normalizedSlug = String(roleData.slug || roleData.name || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-');

      if (!normalizedSlug || ['superadmin', 'company_admin', 'admin', 'user'].includes(normalizedSlug)) {
        throw new BadRequestException('El nombre o slug del rol está reservado.');
      }

      const existingRole = await Role.findOne({
        where: { slug: normalizedSlug, companyId },
        transaction,
      });
      if (existingRole) {
        throw new BadRequestException('Ya existe un rol con este slug en su compañía.');
      }

      const newRole = await Role.create(
        {
          ...roleData,
          slug: normalizedSlug,
          companyId,
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

  async getUserCustomRoles(userId: number, companyId: number): Promise<Role[]> {
    return Role.findAll({
      where: { userId, companyId },
    });
  }

  async getAllAvailableRoles(companyId: number): Promise<Role[]> {
    return Role.findAll({
      where: {
        slug: { [Op.ne]: 'superadmin' },
        [Op.or]: [
          { companyId: null, slug: { [Op.in]: ['company_admin', 'user'] } },
          { companyId },
        ],
      },
    });
  }

  async updateCustomRole(
    adminUserId: number,
    roleId: number,
    roleData: any,
    companyId: number,
  ): Promise<Role> {
    const transaction = await this.sequelize.transaction();
    try {
      const role = await Role.findByPk(roleId, { transaction });
      if (!role) {
        throw new NotFoundException('Rol no encontrado');
      }

      if (!role.companyId || role.companyId !== companyId) {
        throw new ForbiddenException('No tienes permiso para editar este rol');
      }

      const safeUpdates = { ...roleData };
      delete safeUpdates.companyId;
      delete safeUpdates.userId;

      if (safeUpdates.slug && safeUpdates.slug !== role.slug) {
        if (['superadmin', 'company_admin', 'admin', 'user'].includes(String(safeUpdates.slug).toLowerCase())) {
          throw new BadRequestException('Slug reservado por el sistema');
        }
        const existingRole = await Role.findOne({
          where: { slug: safeUpdates.slug, companyId, id: { [Op.ne]: roleId } },
          transaction,
        });
        if (existingRole) {
          throw new BadRequestException('Ya existe un rol con este slug en su compañía');
        }
      }

      await role.update(safeUpdates, { transaction });
      await transaction.commit();
      return role;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteCustomRole(
    _adminUserId: number,
    roleId: number,
    companyId: number,
  ): Promise<void> {
    const transaction = await this.sequelize.transaction();
    try {
      const role = await Role.findByPk(roleId, { transaction });
      if (!role) {
        throw new NotFoundException('Rol no encontrado');
      }

      if (!role.companyId || role.companyId !== companyId) {
        throw new ForbiddenException('No tienes permiso para eliminar este rol');
      }

      await this.userModel.update(
        { roleId: null },
        { where: { roleId, companyId }, transaction },
      );

      await RolePermission.destroy({ where: { roleId }, transaction });
      await role.destroy({ transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
