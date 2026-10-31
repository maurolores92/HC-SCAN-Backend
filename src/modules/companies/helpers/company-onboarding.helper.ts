import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Op, WhereOptions } from 'sequelize';
import { Users } from '../../users/users.model';
import { Role } from '../../role/role.model';
import { Plan } from '../../plans/plan.model';
import { Company, CompanyStatus, DEFAULT_ENABLED_MODULES } from '../company.model';
import { CreateCompanyDto } from '../dto/create-company.dto';
import { QueryCompanyDto } from '../dto/query-company.dto';

export interface ResolvedInitialAdminParams {
  adminEmail: string;
  adminUsername: string;
  rawPassword: string;
  hashedPassword: string;
  companyAdminRole: Role;
}

/**
 * Valida credenciales únicas y resuelve el rol `company_admin` para el alta inicial de una compañía.
 */
export const prepareInitialCompanyAdmin = async (
  dto: CreateCompanyDto,
  normalizedSlug: string,
): Promise<ResolvedInitialAdminParams> => {
  const adminEmail = (
    dto.adminEmail ||
    dto.email ||
    `admin@${normalizedSlug}.com`
  )
    .toLowerCase()
    .trim();

  const existingAdminEmail = await Users.findOne({
    where: { email: adminEmail },
  });
  if (existingAdminEmail) {
    throw new BadRequestException(
      `Ya existe un usuario con el email '${adminEmail}'. Especifique un adminEmail diferente.`,
    );
  }

  const adminUsername = (
    dto.adminUsername ||
    `admin_${normalizedSlug.replace(/[^a-zA-Z0-9]/g, '_')}`
  )
    .toLowerCase()
    .trim();

  const existingUsername = await Users.findOne({
    where: { username: adminUsername },
  });
  if (existingUsername) {
    throw new BadRequestException(
      `El nombre de usuario '${adminUsername}' ya existe en el sistema.`,
    );
  }

  const companyAdminRole =
    (await Role.findOne({
      where: { slug: 'company_admin', userId: null },
    })) ||
    (await Role.findOne({
      where: { slug: 'admin', userId: null },
    }));

  if (!companyAdminRole) {
    throw new BadRequestException(
      'El rol Administrador de Compañía (company_admin) no está inicializado en el sistema',
    );
  }

  const rawPassword = dto.adminPassword || `${normalizedSlug}2026!`;
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  return {
    adminEmail,
    adminUsername,
    rawPassword,
    hashedPassword,
    companyAdminRole,
  };
};

/**
 * Construye los atributos iniciales de una compañía combinando su DTO y el plan asignado.
 */
export const buildCompanyCreationAttributes = (
  dto: CreateCompanyDto,
  slug: string,
  assignedPlan: Plan | null,
) => {
  const useCustom = Boolean(dto.useCustomLimits);
  return {
    ...dto,
    slug,
    status: dto.status || CompanyStatus.ACTIVE,
    planId: assignedPlan?.id ?? null,
    useCustomLimits: useCustom,
    maxUsers: useCustom
      ? (dto.maxUsers !== undefined ? dto.maxUsers : (assignedPlan?.maxUsers ?? 10))
      : (dto.maxUsers ?? assignedPlan?.maxUsers ?? 10),
    maxDocuments: useCustom ? (dto.maxDocuments ?? null) : null,
    maxStorageMb: useCustom ? (dto.maxStorageMb ?? null) : null,
    maxAiQueriesMonthly: useCustom ? (dto.maxAiQueriesMonthly ?? null) : null,
    enabledModules:
      dto.enabledModules && dto.enabledModules.length > 0
        ? dto.enabledModules
        : assignedPlan?.includedModules || DEFAULT_ENABLED_MODULES,
  };
};

/**
 * Construye el filtro `WhereOptions` de búsqueda y estado para el listado de compañías.
 */
export const buildCompanySearchWhere = (query: QueryCompanyDto): WhereOptions<Company> => {
  const { search, status } = query;
  const where: WhereOptions<Company> = {};

  if (status) where.status = status;

  if (search) {
    const searchWildcard = `%${search.trim()}%`;
    const likeOp = Op.iLike ? Op.iLike : Op.like;
    where[Op.or] = [
      { name: { [likeOp]: searchWildcard } },
      { slug: { [likeOp]: searchWildcard } },
      { legalName: { [likeOp]: searchWildcard } },
      { taxId: { [likeOp]: searchWildcard } },
      { email: { [likeOp]: searchWildcard } },
    ];
  }

  return where;
};
