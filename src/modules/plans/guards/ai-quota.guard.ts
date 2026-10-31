import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_AI_QUOTA_KEY } from '../decorators/require-ai-quota.decorator';
import { TenantQuotasService } from '../services/tenant-quotas.service';

/**
 * Guard preparado para endpoints de Inteligencia Artificial.
 * Verifica estado de compañía y disponibilidad en el cupo mensual `maxAiQueriesMonthly`.
 */
@Injectable()
export class AiQuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantQuotasService: TenantQuotasService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresQuota = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_AI_QUOTA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiresQuota) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    const isSuperAdmin =
      user.role === 'superadmin' ||
      (user.isAdmin === true && (user.companyId === null || user.companyId === undefined));

    if (isSuperAdmin && !user.companyId) {
      return true;
    }

    if (!user.companyId) {
      throw new ForbiddenException(
        'El usuario no posee una compañía asociada para ejecutar consultas de IA.',
      );
    }

    await this.tenantQuotasService.assertCanExecuteAiQuery(Number(user.companyId));
    return true;
  }
}

