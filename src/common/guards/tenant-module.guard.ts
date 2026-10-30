import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TENANT_MODULE_KEY } from '../decorators/require-tenant-module.decorator';
import { Company, CompanyStatus } from '../../modules/companies/company.model';

@Injectable()
export class TenantModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<string>(
      TENANT_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModule) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Super Admin de la plataforma tiene acceso irrestricto
    const isSuperAdmin =
      user.role === 'superadmin' ||
      (user.isAdmin && (user.companyId === null || user.companyId === undefined));

    if (isSuperAdmin) {
      return true;
    }

    if (!user.companyId) {
      throw new ForbiddenException(
        'El usuario no tiene una compañía asociada para acceder a este módulo.',
      );
    }

    const company = await Company.findByPk(user.companyId);
    if (!company) {
      throw new ForbiddenException('La compañía asignada al usuario no existe.');
    }

    if (
      company.status === CompanyStatus.INACTIVE ||
      company.status === CompanyStatus.SUSPENDED
    ) {
      throw new ForbiddenException(
        'La compañía se encuentra inactiva o suspendida.',
      );
    }

    const enabledModules: string[] = Array.isArray(company.enabledModules)
      ? company.enabledModules
      : [];

    if (!enabledModules.includes(requiredModule)) {
      throw new ForbiddenException(
        `El módulo '${requiredModule}' no se encuentra habilitado para su empresa.`,
      );
    }

    return true;
  }
}

