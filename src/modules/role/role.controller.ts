import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Put,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { isPlatformSuperAdmin } from '../../common/utils/tenant-scope.util';

/**
 * Controlador de Roles por Compañía.
 * La creación, edición y baja de roles personalizados pertenece exclusivamente a cada compañía.
 * El Super Administrador solo consulta las plantillas base globales desde el módulo de Permisos.
 */
@Auth()
@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  private assertTenantActor(user: any): void {
    if (isPlatformSuperAdmin(user)) {
      throw new ForbiddenException(
        'El Super Administrador de plataforma no gestiona roles operativos de compañías.',
      );
    }
  }

  @Post()
  @RequirePermission('CREATE_ROLE')
  create(@Body() createRoleDto: CreateRoleDto, @GetUser() user: any) {
    this.assertTenantActor(user);
    return this.roleService.create(createRoleDto, user);
  }

  @Get()
  @RequirePermission('VIEW_ROLES', 'CREATE_USER', 'UPDATE_USER')
  findAll(
    @GetUser() user: any,
    @Query('includeSuperAdmin') includeSuperAdmin?: string,
  ) {
    if (includeSuperAdmin === 'true') {
      return this.roleService.findEditableRoles(user);
    }
    return this.roleService.findAll(user);
  }

  @Get(':id')
  @RequirePermission('VIEW_ROLES')
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.roleService.findOne(id, user);
  }

  @Put(':id')
  @Patch(':id')
  @RequirePermission('UPDATE_ROLE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
    @GetUser() user: any,
  ) {
    this.assertTenantActor(user);
    return this.roleService.update(id, updateRoleDto, user);
  }

  @Delete(':id')
  @RequirePermission('DELETE_ROLE')
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    this.assertTenantActor(user);
    return this.roleService.delete(id, user);
  }
}
