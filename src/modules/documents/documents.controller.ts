import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  ParseIntPipe,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';
import { QueryDocumentDto } from './dto/query-document.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RequireTenantModule } from '../../common/decorators/require-tenant-module.decorator';
import { TenantModuleGuard } from '../../common/guards/tenant-module.guard';

@Controller('documents')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, TenantModuleGuard)
@RequireTenantModule('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * Carga de archivos PDF desde la aplicación web
   */
  @Post('upload')
  @RequirePermission('UPLOAD_DOCUMENT')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB máximo
      fileFilter: (req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith('.pdf')) {
          return cb(new BadRequestException('Solo se permiten archivos en formato PDF'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: any,
  ) {
    return this.documentsService.uploadFromApp(file, user);
  }

  /**
   * Sincronización bajo demanda de archivos subidos por FTP en storage/tenancy/<companyId>
   */
  @Post('sync-ftp')
  @RequirePermission('UPLOAD_DOCUMENT')
  syncFtp(
    @GetUser() user: any,
    @Query('companyId') customCompanyId?: string,
  ) {
    const isSuperAdmin = user.role === 'superadmin';
    const targetCompanyId = isSuperAdmin && customCompanyId ? Number(customCompanyId) : user.companyId;

    if (!targetCompanyId) {
      throw new BadRequestException('Se requiere una compañía para sincronizar el FTP');
    }

    return this.documentsService.scanFtpFolder(targetCompanyId, user.id);
  }

  /**
   * Listado paginado de documentos con filtros de búsqueda y estado
   */
  @Get()
  @RequirePermission('VIEW_DOCUMENTS')
  findAll(
    @GetUser() user: any,
    @Query() query: QueryDocumentDto,
  ) {
    const isSuperAdmin = user.role === 'superadmin';
    return this.documentsService.findAll(user.companyId, query, isSuperAdmin);
  }

  /**
   * Detalle de un documento por ID
   */
  @Get(':id')
  @RequirePermission('VIEW_DOCUMENTS')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
  ) {
    const isSuperAdmin = user.role === 'superadmin';
    return this.documentsService.findById(id, user.companyId, isSuperAdmin);
  }

  /**
   * Descarga o visualización directa del PDF en stream
   */
  @Get(':id/file')
  @RequirePermission('VIEW_DOCUMENTS')
  async getFile(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
    @Res() res: Response,
  ) {
    const isSuperAdmin = user.role === 'superadmin';
    const { stream, document } = await this.documentsService.getFileStream(
      id,
      user.companyId,
      isSuperAdmin,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(document.originalName)}"`,
      'Content-Length': document.fileSize,
    });

    stream.pipe(res);
  }

  /**
   * Eliminación de un documento
   */
  @Delete(':id')
  @RequirePermission('DELETE_DOCUMENT')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
  ) {
    const isSuperAdmin = user.role === 'superadmin';
    return this.documentsService.remove(id, user.companyId, user.id, isSuperAdmin);
  }
}
