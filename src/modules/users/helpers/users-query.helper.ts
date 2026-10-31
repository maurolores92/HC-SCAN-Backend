import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { Users, UserStatus } from '../users.model';

export interface UsersPaginatedFilters {
  search?: string;
  roleId?: number;
  status?: string;
  companyId?: number;
}

export function toPlainUserRecord(user: Users): Record<string, unknown> {
  return user.toJSON();
}

export async function validateUniqueUserCredentials(
  userModel: typeof Users,
  data: { email?: string; username?: string },
  transaction: Transaction,
  currentUser?: Users,
): Promise<void> {
  if (data.email && (!currentUser || data.email !== currentUser.email)) {
    const existingEmail = await userModel.findOne({
      where: { email: String(data.email) },
      transaction,
    });
    if (existingEmail) {
      throw new BadRequestException(
        currentUser ? 'El email ya está en uso' : 'El usuario ya existe',
      );
    }
  }

  if (
    data.username &&
    (!currentUser || data.username !== currentUser.username)
  ) {
    const existingUsername = await userModel.findOne({
      where: { username: String(data.username) },
      transaction,
    });
    if (existingUsername) {
      throw new BadRequestException('El nombre de usuario ya está en uso');
    }
  }
}

export function buildUsersPaginatedWhere(
  filters: UsersPaginatedFilters,
): WhereOptions {
  if (!filters.companyId || filters.companyId <= 0) {
    throw new ForbiddenException(
      'Acceso denegado: Se requiere un identificador de compañía válido.',
    );
  }

  const baseStatus =
    filters.status === 'INACTIVE'
      ? UserStatus.INACTIVE
      : { [Op.ne]: UserStatus.INACTIVE };

  const where: Record<string | symbol, unknown> = {
    companyId: Number(filters.companyId),
    status: baseStatus,
    username: { [Op.ne]: 'superadmin' },
  };

  if (filters.search) {
    const searchWildcard = `%${filters.search}%`;
    where[Op.and] = [
      { username: { [Op.ne]: 'superadmin' } },
      {
        [Op.or]: [
          { name: { [Op.like]: searchWildcard } },
          { lastName: { [Op.like]: searchWildcard } },
          { email: { [Op.like]: searchWildcard } },
          { username: { [Op.like]: searchWildcard } },
        ],
      },
    ];
  }

  if (filters.roleId) {
    where.roleId = filters.roleId;
  }

  return where;
}

export function mapUserWithMergedPermissions(
  user: Users,
  includeUsername = false,
): Record<string, any> {
  const rolePerms: string[] =
    user.role && Array.isArray(user.role.permissions)
      ? user.role.permissions.map((p: { name: string }) => String(p.name))
      : [];
  const directPerms: string[] = Array.isArray(user.directPermissions)
    ? user.directPermissions.map((p: { name: string }) => String(p.name))
    : [];
  const mergedPermissions = Array.from(new Set([...rolePerms, ...directPerms]));

  return {
    id: user.id,
    name: user.name,
    lastName: user.lastName,
    email: user.email,
    ...(includeUsername ? { username: user.username } : {}),
    password: user.password,
    status: user.status,
    isAdmin: user.isAdmin,
    companyId: user.companyId,
    createdByAdminId: user.createdByAdminId,
    role: user.role ? user.role.slug : null,
    roleId: user.roleId,
    image: (user as any).image || null,
    document: user.document || null,
    permissions: mergedPermissions,
  };
}
