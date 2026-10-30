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

  @Get()
  @RequirePermission('VIEW_AUDITS')
  findAll(@GetUser() user: any, @Query() query: QueryAuditDto) {
    // Aislamiento multitenant: los usuarios que no sean superadmin solo ven auditorías de su empresa
    if (user.role !== 'superadmin' && user.companyId) {
      query.companyId = user.companyId;
    }
    return this.auditService.findAll(query);
  }
}
