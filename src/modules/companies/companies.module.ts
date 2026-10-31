import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Company } from './company.model';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { CompanyTrialService } from './services/company-trial.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Company]),
    AuditModule,
    NotificationsModule,
    PlansModule,
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyTrialService],
  exports: [CompaniesService, CompanyTrialService, SequelizeModule],
})
export class CompaniesModule {}
