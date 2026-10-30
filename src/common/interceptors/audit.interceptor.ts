import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../modules/audit/audit.service';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, context.getHandler());

    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const companyId: number | undefined = req.companyId ?? req.user?.companyId;
    const ipAddress: string =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    const entityId = req.params?.id ?? req.body?.id ?? undefined;

    return next.handle().pipe(
      tap(() => {
        this.auditService
          .log({
            companyId,
            userId: user?.id,
            userName: user ? `${user.name} ${user.lastName}` : undefined,
            action: meta.action,
            entity: meta.entity,
            entityId,
            payload: req.method !== 'GET' ? req.body : undefined,
            ipAddress,
          })
          .catch(() => {
            // Los fallos de auditoría no deben romper la solicitud principal
          });
      }),
    );
  }
}
