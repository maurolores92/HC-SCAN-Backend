import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompanyDto } from './dto/query-company.dto';
import { CompanyStatus } from './company.model';
import { assertPlatformSuperAdmin } from '../../common/utils/tenant-scope.util';

/**
 * Controlador de gestión de Compañías (Tenants).
 * Acceso exclusivo del Super Administrador de la plataforma (no existen permisos delegables).
 */
@Controller('companies')
@UseGuards(AuthGuard('jwt'))
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  create(
    @Body() createCompanyDto: CreateCompanyDto,
    @GetUser() user: any,
  ) {
    assertPlatformSuperAdmin(
      user,
      'Acceso denegado: El módulo de compañías está reservado exclusivamente para el Super Administrador de la plataforma.',
    );
    return this.companiesService.create(createCompanyDto, user.id);
  }

  @Get()
  findAll(@Query() query: QueryCompanyDto, @GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.companiesService.findAll(query);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string, @GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.companiesService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.companiesService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @GetUser() user: any,
  ) {
    assertPlatformSuperAdmin(user);
    return this.companiesService.update(id, updateCompanyDto, user.id);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: CompanyStatus,
    @GetUser() user: any,
  ) {
    assertPlatformSuperAdmin(user);
    return this.companiesService.changeStatus(id, status, user.id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
  ) {
    assertPlatformSuperAdmin(user);
    return this.companiesService.remove(id, user.id);
  }
}
