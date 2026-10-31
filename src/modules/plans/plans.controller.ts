import {
  BadRequestException,
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
import { PlansService } from './plans.service';
import { TenantQuotasService } from './services/tenant-quotas.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { QueryPlanDto } from './dto/query-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import {
  assertPlatformSuperAdmin,
  isPlatformSuperAdmin,
} from '../../common/utils/tenant-scope.util';

/**
 * Controlador de Planes de Suscripción y consulta de cuota activa.
 * Incluye catálogo público sin autenticación en `GET /plans/public` para la landing page web.
 */
@Controller('plans')
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly tenantQuotasService: TenantQuotasService,
  ) {}

  @Public()
  @Get('public')
  getPublicCatalog() {
    return this.plansService.findAllPublic();
  }

  @Get('my-quota')
  async getMyQuota(
    @GetUser() user: any,
    @Query('companyId') queryCompanyId?: string,
  ) {
    const superAdmin = isPlatformSuperAdmin(user);
    const targetCompanyId =
      superAdmin && queryCompanyId
        ? Number(queryCompanyId)
        : user?.companyId
          ? Number(user.companyId)
          : null;

    if (!targetCompanyId) {
      if (superAdmin) {
        return {
          isSuperAdmin: true,
          companyId: null,
          plan: { id: 0, name: 'Super Admin Global', slug: 'superadmin', badgeColor: 'error' },
          useCustomLimits: false,
          users: { current: 0, max: null, unlimited: true, percentage: 0 },
          documents: { current: 0, max: null, unlimited: true, percentage: 0 },
          storageMb: { current: 0, max: null, unlimited: true, percentage: 0, currentBytes: 0 },
          aiQueries: { current: 0, max: null, unlimited: true, percentage: 0, period: '', tokensUsed: 0, aiDocumentsProcessed: 0 },
        };
      }
      throw new BadRequestException('El usuario no posee una compañía asociada');
    }

    return this.tenantQuotasService.getCompanyQuotaSummary(targetCompanyId);
  }

  @Post()
  create(@Body() dto: CreatePlanDto, @GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.plansService.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: QueryPlanDto, @GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.plansService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.plansService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanDto,
    @GetUser() user: any,
  ) {
    assertPlatformSuperAdmin(user);
    return this.plansService.update(id, dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.plansService.remove(id, user.id);
  }
}
