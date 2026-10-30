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
} from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ForbiddenException } from '@nestjs/common';

@Auth()
@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @RequirePermission('CREATE_ROLE')
  create(@Body() createRoleDto: CreateRoleDto, @GetUser() user: any) {
    if (!user.isAdmin) {
      throw new ForbiddenException(
        'Solo los administradores pueden crear roles',
      );
    }

    return this.roleService.create(createRoleDto, user);
  }

  @Get()
  @RequirePermission('VIEW_ROLES')
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
  findOne(@Param('id') id: string) {
    return this.roleService.findOne(+id);
  }

  @Put(':id')
  @Patch(':id')
  @RequirePermission('UPDATE_ROLE')
  update(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @GetUser() user: any,
  ) {
    if (!user.isAdmin) {
      throw new ForbiddenException(
        'Solo los administradores pueden actualizar roles',
      );
    }
    return this.roleService.update(+id, updateRoleDto, user);
  }

  @Delete(':id')
  @RequirePermission('DELETE_ROLE')
  remove(@Param('id') id: string, @GetUser() user: any) {
    if (!user.isAdmin) {
      throw new ForbiddenException(
        'Solo los administradores pueden eliminar roles',
      );
    }
    return this.roleService.delete(+id, user);
  }
}
