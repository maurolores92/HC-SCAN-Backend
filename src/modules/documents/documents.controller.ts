import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  ParseIntPipe,
  Res,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';
import { DocumentAiChatService } from './services/document-ai-chat.service';
import { QueryDocumentDto } from './dto/query-document.dto';
import { ChatDocumentDto } from './dto/chat-document.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RequireTenantModule } from '../../common/decorators/require-tenant-module.decorator';
import { TenantModuleGuard } from '../../common/guards/tenant-module.guard';
import { RequireAiQuota } from '../plans/decorators/require-ai-quota.decorator';
import { AiQuotaGuard } from '../plans/guards/ai-quota.guard';
import {
  isPlatformSuperAdmin,
  requireTenantCompanyId,
} from '../../common/utils/tenant-scope.util';

/**
 * @controller DocumentsController
 * Ingesta web, sincronización SFTP/local, búsqueda universal,
 * reprocesamiento OCR/IA y Chat Conversacional Inteligente sobre documentos.
 */
@Controller('documents')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, TenantModuleGuard, AiQuotaGuard)
@RequireTenantModule('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentAiChatService: DocumentAiChatService,
  ) {}

  private assertTenantCompany(user: any): number {
    if (isPlatformSuperAdmin(user)) {
      throw new ForbiddenException(
        'El Super Administrador de plataforma no sube ni accede a documentos de compañías.',
      );
    }
    return requireTenantCompanyId(user);
  }

  @Post('upload')
  @RequirePermission('UPLOAD_DOCUMENT')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith('.pdf')) {
          return cb(new BadRequestException('Solo se permiten archivos en formato PDF'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File, @GetUser() user: any) {
    const tenantCompanyId = this.assertTenantCompany(user);
    return this.documentsService.uploadFromApp(file, { ...user, companyId: tenantCompanyId });
  }

  @Post('sync-ftp')
  @RequirePermission('UPLOAD_DOCUMENT')
  syncFtp(@GetUser() user: any) {
    const tenantCompanyId = this.assertTenantCompany(user);
    return this.documentsService.scanFtpFolder(tenantCompanyId, user.id);
  }

  @Post('chat')
  @RequirePermission('QUERY_AI_DOCUMENTS')
  @RequireAiQuota()
  chatWithDocuments(@Body() dto: ChatDocumentDto, @GetUser() user: any) {
    this.assertTenantCompany(user);
    return this.documentAiChatService.chat(dto, user);
  }

  @Get('chat/context-documents')
  @RequirePermission('QUERY_AI_DOCUMENTS')
  getChatContextDocuments(@GetUser() user: any) {
    this.assertTenantCompany(user);
    return this.documentAiChatService.getRecentDocumentsForChat(user);
  }

  @Get('facets')
  @RequirePermission('VIEW_DOCUMENTS')
  getFacets(@GetUser() user: any) {
    const tenantCompanyId = this.assertTenantCompany(user);
    return this.documentsService.getFacets(tenantCompanyId);
  }

  @Get()
  @RequirePermission('VIEW_DOCUMENTS')
  findAll(@GetUser() user: any, @Query() query: QueryDocumentDto) {
    const tenantCompanyId = this.assertTenantCompany(user);
    return this.documentsService.findAll(tenantCompanyId, query);
  }

  @Get(':id')
  @RequirePermission('VIEW_DOCUMENTS')
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    const tenantCompanyId = this.assertTenantCompany(user);
    return this.documentsService.findById(id, tenantCompanyId);
  }

  @Post(':id/reprocess')
  @RequirePermission('UPLOAD_DOCUMENT')
  reprocess(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    const tenantCompanyId = this.assertTenantCompany(user);
    return this.documentsService.reprocessDocument(id, tenantCompanyId, user.id);
  }

  @Get(':id/file')
  @RequirePermission('VIEW_DOCUMENTS')
  async getFile(@Param('id', ParseIntPipe) id: number, @GetUser() user: any, @Res() res: Response) {
    const tenantCompanyId = this.assertTenantCompany(user);
    const { stream, document } = await this.documentsService.getFileStream(id, tenantCompanyId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(document.originalName)}"`,
      'Content-Length': document.fileSize,
    });

    stream.pipe(res);
  }

  @Delete(':id')
  @RequirePermission('DELETE_DOCUMENT')
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    const tenantCompanyId = this.assertTenantCompany(user);
    return this.documentsService.remove(id, tenantCompanyId, user.id);
  }
}
