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
import { UsersCustomRolesService } from './services/users-custom-roles.service';
import { UsersAuthProfileService } from './services/users-auth-profile.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Users, Role, Company]),
    JwtModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersCustomRolesService, UsersAuthProfileService],
  exports: [
    SequelizeModule,
    UsersService,
    UsersCustomRolesService,
    UsersAuthProfileService,
  ],
})
export class UsersModule {}
