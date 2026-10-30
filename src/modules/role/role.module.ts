import { Module } from '@nestjs/common';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Users } from '../users/users.model';
import { Role } from './role.model';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Role, Users]),
    AuditModule,
    NotificationsModule,
  ],
  controllers: [RoleController],
  providers: [RoleService],
  exports: [RoleService, SequelizeModule],
})
export class RoleModule {}
