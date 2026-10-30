import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ForbiddenException } from '@nestjs/common';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@Auth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermission('VIEW_PERMISSIONS')
  findAll(@GetUser() user: any) {
    return this.permissionsService.findAll(user);
  }

  @Put(':id')
  updatePermissionRoles(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
    @GetUser() user: any,
  ) {
    if (!user.isAdmin && user.role !== 'superadmin') {
      throw new ForbiddenException(
        'Solo los administradores pueden actualizar permisos',
      );
    }
    return this.permissionsService.updatePermissionRoles(
      +id,
      updatePermissionDto.roleIds || [],
      updatePermissionDto.description,
      updatePermissionDto.displayName,
    );
  }
}
