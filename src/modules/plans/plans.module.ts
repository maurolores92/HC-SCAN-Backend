import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Plan } from './plan.model';
import { CompanyMonthlyUsage } from './models/company-monthly-usage.model';
import { Company } from '../companies/company.model';
import { Users } from '../users/users.model';
import { Document } from '../documents/document.model';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlansService } from './plans.service';
import { CompanyQuotaSummaryService } from './services/company-quota-summary.service';
import { TenantQuotasService } from './services/tenant-quotas.service';
import { ExchangeRateService } from './services/exchange-rate.service';
import { AiQuotaGuard } from './guards/ai-quota.guard';
import { PlansController } from './plans.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Plan,
      CompanyMonthlyUsage,
      Company,
      Users,
      Document,
    ]),
    AuditModule,
    NotificationsModule,
  ],
  controllers: [PlansController],
  providers: [
    PlansService,
    CompanyQuotaSummaryService,
    TenantQuotasService,
    AiQuotaGuard,
    ExchangeRateService,
  ],
  exports: [
    SequelizeModule,
    PlansService,
    CompanyQuotaSummaryService,
    TenantQuotasService,
    AiQuotaGuard,
    ExchangeRateService,
  ],
})
export class PlansModule {}
