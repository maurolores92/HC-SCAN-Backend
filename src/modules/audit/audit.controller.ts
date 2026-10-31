import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@Auth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Consulta paginada de auditorías con aislamiento estricto por compañía.
   * Los usuarios tenant solo ven movimientos propios de su compañía, nunca movimientos del Super Admin ni entidades globales.
   */
  @Get()
  @RequirePermission('VIEW_AUDITS')
  findAll(@GetUser() user: any, @Query() query: QueryAuditDto) {
    return this.auditService.findAll(query, user);
  }
}
