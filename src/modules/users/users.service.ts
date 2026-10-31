import { Op, WhereOptions } from 'sequelize';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CrudService } from '../../common/crud/crud.service';
import { Role } from '../role/role.model';
import { Company } from '../companies/company.model';
import { Permission } from '../permissions/permission.model';
import { Users } from './users.model';
import {
  AdminActorContext,
  CreateOrUpdateUserPayload,
  UsersAuthProfileService,
  UsersCustomRolesService,
  UsersLifecycleService,
} from './services';
import {
  buildUsersPaginatedWhere,
  toPlainUserRecord,
} from './helpers/users-query.helper';
import {
  isPlatformSuperAdmin,
  requireTenantCompanyId,
} from '../../common/utils/tenant-scope.util';

@Injectable()
export class UsersService extends CrudService<Users> {
  constructor(
    @InjectModel(Users) private readonly userModel: typeof Users,
    private readonly customRolesService: UsersCustomRolesService,
    private readonly authProfileService: UsersAuthProfileService,
    private readonly lifecycleService: UsersLifecycleService,
  ) {
    super(userModel);
  }

  override async create(
    data: any,
    createdByAdminId?: number,
    adminCompanyId?: number,
  ): Promise<Users> {
    return this.lifecycleService.createUser(
      data as CreateOrUpdateUserPayload,
      createdByAdminId,
      adminCompanyId,
    );
  }

  override async findAll(companyId?: number): Promise<Users[]> {
    if (!companyId) {
      throw new ForbiddenException('Se requiere una compañía válida para listar usuarios.');
    }

    const where: WhereOptions = {
      companyId,
      username: { [Op.ne]: 'superadmin' },
    };

    return this.userModel.findAll({
      where,
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
    if (!filters.companyId) {
      throw new ForbiddenException('Se requiere una compañía válida para listar usuarios.');
    }

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

  override async findOne(id: number, actorUser?: any): Promise<Users> {
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

    if (actorUser && Number(actorUser.id) !== Number(id)) {
      if (isPlatformSuperAdmin(actorUser)) {
        throw new ForbiddenException(
          'El Super Administrador no consulta perfiles individuales de compañías.',
        );
      }

      const canViewUsers =
        actorUser.isAdmin === true ||
        actorUser.role === 'company_admin' ||
        (Array.isArray(actorUser.permissions) && actorUser.permissions.includes('VIEW_USERS'));

      if (!canViewUsers) {
        throw new ForbiddenException('No posees permisos para consultar usuarios.');
      }

      const tenantCompanyId = requireTenantCompanyId(actorUser);
      const isTargetSuperAdmin =
        String(user.username || '').toLowerCase() === 'superadmin' ||
        user.role?.slug === 'superadmin';

      if (isTargetSuperAdmin || user.companyId !== tenantCompanyId) {
        throw new ForbiddenException('No tienes permiso para acceder a un usuario de otra compañía.');
      }
    }

    return user;
  }

  async updateUser(
    userId: number,
    updateData: any,
    actorUser?: {
      id: number;
      role?: string;
      companyId?: number;
      isAdmin?: boolean;
      permissions?: string[];
    },
  ): Promise<Users> {
    return this.lifecycleService.updateUser(
      userId,
      updateData as CreateOrUpdateUserPayload,
      actorUser,
    );
  }

  async deleteUser(
    userId: number,
    actorUser?: { id: number; role?: string; companyId?: number; isAdmin?: boolean },
  ): Promise<void> {
    return this.lifecycleService.deactivateUser(userId, actorUser);
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

  async changePassword(userId: number, newPassword: string, actorUser?: any): Promise<any> {
    return this.authProfileService.changePassword(userId, newPassword, actorUser);
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

  async createCustomRole(adminUserId: number, roleData: any, companyId: number): Promise<Role> {
    return this.customRolesService.createCustomRole(adminUserId, roleData, companyId);
  }

  async getUserCustomRoles(userId: number, companyId: number): Promise<Role[]> {
    return this.customRolesService.getUserCustomRoles(userId, companyId);
  }

  async getAllAvailableRoles(companyId: number): Promise<Role[]> {
    return this.customRolesService.getAllAvailableRoles(companyId);
  }

  async updateCustomRole(
    adminUserId: number,
    roleId: number,
    roleData: any,
    companyId: number,
  ): Promise<Role> {
    return this.customRolesService.updateCustomRole(adminUserId, roleId, roleData, companyId);
  }

  async deleteCustomRole(
    adminUserId: number,
    roleId: number,
    companyId: number,
  ): Promise<void> {
    return this.customRolesService.deleteCustomRole(adminUserId, roleId, companyId);
  }
}
