import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import {
  assertPlatformSuperAdmin,
  isPlatformSuperAdmin,
  requireTenantCompanyId,
} from '../../common/utils/tenant-scope.util';

/**
 * Controlador de Permisos.
 * La vista global y edición de permisos (`PUT /permissions/:id`) es exclusiva del Super Admin.
 * La consulta `GET /permissions` entrega al Super Admin el catálogo completo con roles base, y a
 * gestores de roles/usuarios del tenant únicamente los permisos operativos delegables que poseen.
 */
@Auth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  findAll(@GetUser() user: any) {
    if (isPlatformSuperAdmin(user)) {
      return this.permissionsService.findAll(user);
    }

    requireTenantCompanyId(user);
    const userPerms: string[] = Array.isArray(user?.permissions) ? user.permissions : [];
    const canDelegateInTenant =
      user?.isAdmin === true ||
      user?.role === 'company_admin' ||
      userPerms.some((p) =>
        ['VIEW_ROLES', 'CREATE_ROLE', 'UPDATE_ROLE', 'UPDATE_USER'].includes(p),
      );

    if (!canDelegateInTenant) {
      throw new ForbiddenException(
        'Acceso denegado: No posee permisos para consultar el listado de permisos.',
      );
    }

    return this.permissionsService.findAll(user);
  }

  @Put(':id')
  updatePermissionRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePermissionDto: UpdatePermissionDto,
    @GetUser() user: any,
  ) {
    assertPlatformSuperAdmin(
      user,
      'Acceso denegado: Solo el Super Administrador de la plataforma puede modificar permisos globales.',
    );

    return this.permissionsService.updatePermissionRoles(
      id,
      updatePermissionDto.roleIds || [],
      updatePermissionDto.description,
      updatePermissionDto.displayName,
    );
  }
}
