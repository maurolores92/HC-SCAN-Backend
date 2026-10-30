import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompanyDto } from './dto/query-company.dto';
import { CompanyStatus } from './company.model';

@Controller('companies')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  /**
   * Valida estrictamente que solo el Super Admin de plataforma pueda acceder.
   * Ninguna compañía bajo ningún concepto tiene acceso a la gestión de compañías.
   */
  private assertSuperAdminOnly(user: any) {
    const isSuperAdmin =
      user?.role === 'superadmin' ||
      (user?.isAdmin === true && (user?.companyId === null || user?.companyId === undefined));

    if (!isSuperAdmin) {
      throw new ForbiddenException(
        'Acceso denegado: El módulo de compañías está reservado exclusivamente para el Super Administrador de la plataforma.',
      );
    }
  }

  @Post()
  @RequirePermission('CREATE_COMPANY')
  create(
    @Body() createCompanyDto: CreateCompanyDto,
    @GetUser() user: any,
  ) {
    this.assertSuperAdminOnly(user);
    return this.companiesService.create(createCompanyDto, user.id);
  }

  @Get()
  @RequirePermission('VIEW_COMPANIES')
  findAll(@Query() query: QueryCompanyDto, @GetUser() user: any) {
    this.assertSuperAdminOnly(user);
    return this.companiesService.findAll(query);
  }

  @Get('slug/:slug')
  @RequirePermission('VIEW_COMPANIES')
  findBySlug(@Param('slug') slug: string, @GetUser() user: any) {
    this.assertSuperAdminOnly(user);
    return this.companiesService.findBySlug(slug);
  }

  @Get(':id')
  @RequirePermission('VIEW_COMPANIES')
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    this.assertSuperAdminOnly(user);
    return this.companiesService.findById(id);
  }

  @Patch(':id')
  @RequirePermission('UPDATE_COMPANY')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @GetUser() user: any,
  ) {
    this.assertSuperAdminOnly(user);
    return this.companiesService.update(id, updateCompanyDto, user.id);
  }

  @Patch(':id/status')
  @RequirePermission('UPDATE_COMPANY')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: CompanyStatus,
    @GetUser() user: any,
  ) {
    this.assertSuperAdminOnly(user);
    return this.companiesService.changeStatus(id, status, user.id);
  }

  @Delete(':id')
  @RequirePermission('DELETE_COMPANY')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
  ) {
    this.assertSuperAdminOnly(user);
    return this.companiesService.remove(id, user.id);
  }
}
