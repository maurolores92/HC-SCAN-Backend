import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Role } from '../role/role.model';
import { Users } from './users.model';
import { Company } from '../companies/company.model';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlansModule } from '../plans/plans.module';
import {
  UsersCustomRolesService,
  UsersAuthProfileService,
  UsersLifecycleService,
} from './services';

@Module({
  imports: [
    SequelizeModule.forFeature([Users, Role, Company]),
    JwtModule,
    AuditModule,
    NotificationsModule,
    PlansModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersCustomRolesService,
    UsersAuthProfileService,
    UsersLifecycleService,
  ],
  exports: [
    SequelizeModule,
    UsersService,
    UsersCustomRolesService,
    UsersAuthProfileService,
    UsersLifecycleService,
  ],
})
export class UsersModule {}
