import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ValidationPipe,
  Query,
  Put,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { FindAllQuerysDto } from './dto/querys.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import {
  isPlatformSuperAdmin,
  requireTenantCompanyId,
} from '../../common/utils/tenant-scope.util';

/**
 * Controlador de Usuarios por Compañía.
 * Cada compañía administra exclusivamente sus propios usuarios; el Super Admin solo edita su propio perfil.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private assertTenantUserManager(user: any): number {
    if (isPlatformSuperAdmin(user)) {
      throw new ForbiddenException(
        'El Super Administrador de plataforma no gestiona usuarios operativos de compañías.',
      );
    }
    return requireTenantCompanyId(user);
  }

  @Post()
  @Auth()
  @RequirePermission('CREATE_USER')
  async create(@Body() createUserDto: CreateUserDto, @GetUser() user: any) {
    const tenantCompanyId = this.assertTenantUserManager(user);
    return this.usersService.create(createUserDto, user.id, tenantCompanyId);
  }

  @Get('all')
  @Auth()
  @RequirePermission('VIEW_USERS')
  findAll(@GetUser() user: any) {
    const tenantCompanyId = this.assertTenantUserManager(user);
    return this.usersService.findAll(tenantCompanyId);
  }

  @Get('profile-with-roles')
  @Auth()
  async getProfile(@GetUser() user: any) {
    return this.usersService.getUserProfile(user.id);
  }

  @Post('roles/create')
  @Auth()
  @RequirePermission('CREATE_ROLE')
  async createCustomRole(@Body() roleData: any, @GetUser() user: any) {
    const tenantCompanyId = this.assertTenantUserManager(user);
    return this.usersService.createCustomRole(user.id, roleData, tenantCompanyId);
  }

  @Get('roles/my-roles')
  @Auth()
  @RequirePermission('VIEW_ROLES')
  async getMyRoles(@GetUser() user: any) {
    const tenantCompanyId = this.assertTenantUserManager(user);
    return this.usersService.getUserCustomRoles(user.id, tenantCompanyId);
  }

  @Get('roles/available')
  @Auth()
  @RequirePermission('VIEW_ROLES', 'CREATE_USER', 'UPDATE_USER')
  async getAvailableRoles(@GetUser() user: any) {
    const tenantCompanyId = this.assertTenantUserManager(user);
    return this.usersService.getAllAvailableRoles(tenantCompanyId);
  }

  @Put('roles/:id')
  @Auth()
  @RequirePermission('UPDATE_ROLE')
  async updateCustomRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() roleData: any,
    @GetUser() user: any,
  ) {
    const tenantCompanyId = this.assertTenantUserManager(user);
    return this.usersService.updateCustomRole(user.id, id, roleData, tenantCompanyId);
  }

  @Delete('roles/:id')
  @Auth()
  @RequirePermission('DELETE_ROLE')
  async deleteCustomRole(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
  ) {
    const tenantCompanyId = this.assertTenantUserManager(user);
    await this.usersService.deleteCustomRole(user.id, id, tenantCompanyId);
    return { message: 'Rol eliminado exitosamente' };
  }

  @Get('')
  @Auth()
  @RequirePermission('VIEW_USERS')
  async findAllQuerys(
    @GetUser() user: any,
    @Query(new ValidationPipe({ transform: true })) query: FindAllQuerysDto,
  ) {
    const tenantCompanyId = this.assertTenantUserManager(user);
    const { page = 0, pageSize = 10, ...filters } = query;
    filters.companyId = tenantCompanyId;

    return this.usersService.findAllQuerys(
      Number(page),
      Number(pageSize),
      filters,
    );
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.usersService.findOne(id, user);
  }

  @Put(':id')
  @Auth()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser() user: any,
  ) {
    return this.usersService.updateUser(id, updateUserDto, user);
  }

  @Delete(':id')
  @Auth()
  @RequirePermission('DELETE_USER')
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    this.assertTenantUserManager(user);
    return this.usersService.deleteUser(id, user);
  }

  @Put(':id/change-password')
  @Auth()
  async changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() changePasswordDto: ChangePasswordDto,
    @GetUser() user: any,
  ) {
    return this.usersService.changePassword(id, changePasswordDto.password, user);
  }

  @Put(':id/permissions')
  @Auth()
  @RequirePermission('UPDATE_USER')
  async updateDirectPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body('permissionIds') permissionIds: number[],
    @GetUser() user: any,
  ) {
    this.assertTenantUserManager(user);
    return this.usersService.updateDirectPermissions(id, permissionIds, user);
  }
}
