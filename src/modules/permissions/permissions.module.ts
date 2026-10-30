import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Permission } from './permission.model';
import { UserPermission } from './user-permission/user-permission.model';

import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { RolePermission } from './role-permission/role-permission.model';

@Module({
  imports: [
    SequelizeModule.forFeature([Permission, RolePermission, UserPermission]),
  ],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [SequelizeModule, PermissionsService],
})
export class PermissionsModule {}
