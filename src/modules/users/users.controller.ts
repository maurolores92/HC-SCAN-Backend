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
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { FindAllQuerysDto } from './dto/querys.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Auth()
  @RequirePermission('CREATE_USER')
  async create(@Body() createUserDto: CreateUserDto, @GetUser() user: any) {
    if (!user.isAdmin && user.role !== 'superadmin' && user.role !== 'company_admin') {
      throw new BadRequestException(
        'Solo administradores pueden crear nuevos usuarios',
      );
    }
    return this.usersService.create(createUserDto, user.id, user.companyId);
  }

  @Get('all')
  @Auth()
  @RequirePermission('VIEW_USERS')
  findAll(@GetUser() user: any) {
    return this.usersService.findAll(user.id);
  }

  @Get('profile-with-roles')
  @Auth()
  async getProfile(@GetUser() user: any) {
    return this.usersService.getUserProfile(user.id);
  }

  @Post('roles/create')
  @Auth()
  async createCustomRole(@Body() roleData: any, @GetUser() user: any) {
    return this.usersService.createCustomRole(user.id, roleData);
  }

  @Get('roles/my-roles')
  @Auth()
  async getMyRoles(@GetUser() user: any) {
    return this.usersService.getUserCustomRoles(user.id);
  }

  @Get('roles/available')
  @Auth()
  async getAvailableRoles() {
    return this.usersService.getAllAvailableRoles();
  }

  @Put('roles/:id')
  @Auth()
  async updateCustomRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() roleData: any,
    @GetUser() user: any,
  ) {
    return this.usersService.updateCustomRole(user.id, id, roleData);
  }

  @Delete('roles/:id')
  @Auth()
  async deleteCustomRole(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
  ) {
    await this.usersService.deleteCustomRole(user.id, id);
    return { message: 'Rol eliminado exitosamente' };
  }

  @Get('')
  @Auth()
  @RequirePermission('VIEW_USERS')
  async findAllQuerys(
    @GetUser() user: any,
    @Query(new ValidationPipe({ transform: true })) query: FindAllQuerysDto,
  ) {
    const { page = 0, pageSize = 10, ...filters } = query;

    // Si no es superadmin, forzar el filtro por la compañía del usuario autenticado
    const isSuperAdmin = user.role === 'superadmin';
    if (!isSuperAdmin && user.companyId) {
      filters.companyId = user.companyId;
    }

    return this.usersService.findAllQuerys(
      Number(page),
      Number(pageSize),
      filters,
    );
  }

  @Get(':id')
  @Auth()
  @RequirePermission('VIEW_USERS')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Put(':id')
  @Auth()
  @RequirePermission('UPDATE_USER')
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
    return this.usersService.deleteUser(id, user);
  }

  @Put(':id/change-password')
  @Auth()
  async changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(id, changePasswordDto.password);
  }

  @Put(':id/permissions')
  @Auth()
  @RequirePermission('ASSIGN_PERMISSIONS')
  async updateDirectPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body('permissionIds') permissionIds: number[],
    @GetUser() user: any,
  ) {
    return this.usersService.updateDirectPermissions(id, permissionIds, user);
  }
}
