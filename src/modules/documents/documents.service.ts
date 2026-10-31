import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, Op } from 'sequelize';
import { createReadStream, existsSync, unlinkSync, writeFileSync } from 'fs';
import { Document, DocumentSource, DocumentStatus } from './document.model';
import { QueryDocumentDto } from './dto/query-document.dto';
import { resolveSafeStorageFilePath } from '../../common/utils/storage-path.util';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.model';
import { NotificationsService } from '../notifications/notifications.service';
import { Company } from '../companies/company.model';
import { TenantQuotasService } from '../plans/services/tenant-quotas.service';
import {
  assertValidPdfUpload,
  prepareTenantPdfStorageTarget,
} from './helpers/document-storage.helper';
import { buildDocumentSearchWhere } from './helpers/document-search.helper';
import { DocumentProcessingQueueService } from './services/document-processing-queue.service';
import { TenantInboxWatcherService } from './services/tenant-inbox-watcher.service';
import { isPlatformSuperAdmin } from '../../common/utils/tenant-scope.util';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectModel(Document)
    private readonly documentModel: typeof Document,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly tenantQuotasService: TenantQuotasService,
    private readonly processingQueue: DocumentProcessingQueueService,
    private readonly inboxWatcherService: TenantInboxWatcherService,
  ) {}

  private assertValidCompanyScope(companyId?: number | null): number {
    const parsed = Number(companyId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ForbiddenException(
        'Acceso denegado: Se requiere pertenecer a una compañía activa para operar con documentos.',
      );
    }
    return parsed;
  }

  async uploadFromApp(
    file: Express.Multer.File,
    user: { id: number; companyId: number; role?: string; username?: string; name?: string; lastName?: string },
  ): Promise<Document> {
    if (isPlatformSuperAdmin(user)) {
      throw new ForbiddenException(
        'El Super Administrador de plataforma no puede subir documentos.',
      );
    }

    if (!user.companyId || user.companyId <= 0) {
      throw new BadRequestException('El usuario no posee una compañía asignada');
    }

    assertValidPdfUpload(file);
    await this.tenantQuotasService.assertCanStoreDocument(user.companyId, file.size);

    const target = prepareTenantPdfStorageTarget(user.companyId, file);
    const duplicate = await this.documentModel.findOne({
      where: { companyId: user.companyId, fileHash: target.fileHash },
      attributes: ['id', 'originalName'],
    });

    if (duplicate) {
      throw new BadRequestException(
        `Este archivo PDF ya se encuentra registrado en su compañía como '${duplicate.originalName}'`,
      );
    }

    writeFileSync(target.fullPhysicalPath, file.buffer);

    const document = await this.documentModel.create({
      companyId: user.companyId,
      userId: user.id,
      originalName: file.originalname,
      fileName: target.physicalFileName,
      filePath: target.relativePath,
      fileSize: file.size,
      mimeType: file.mimetype,
      source: DocumentSource.APP_UPLOAD,
      status: DocumentStatus.PENDING,
      fileHash: target.fileHash,
    } as never);

    await this.auditService.log({
      action: AuditAction.UPLOAD,
      entity: 'Document',
      entityId: document.id,
      companyId: user.companyId,
      userId: user.id,
      payload: {
        documentId: document.id,
        fileName: document.fileName,
        filePath: document.filePath,
        size: document.fileSize,
        source: document.source,
      },
      description: `Se subió el documento PDF '${document.originalName}' desde la aplicación`,
    });

    await this.notificationsService.dispatch({
      type: 'document.uploaded',
      title: '📄 Documento cargado',
      body: `Se recibió '${document.originalName}' y comenzó su extracción inteligente con IA`,
      companyId: user.companyId,
      actorUser: { id: user.id },
      extraData: { documentId: document.id, link: '/documents' },
    });

    this.processingQueue.enqueue(document.id, user.id);

    return document;
  }

  async scanFtpFolder(companyId: number, actorUserId?: number) {
    const scopedCompanyId = this.assertValidCompanyScope(companyId);
    return this.inboxWatcherService.scanTenantInbox(scopedCompanyId, actorUserId);
  }

  async getFacets(companyId: number) {
    const scopedCompanyId = this.assertValidCompanyScope(companyId);

    const rows = (await this.documentModel.findAll({
      attributes: [
        'documentType',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: {
        companyId: scopedCompanyId,
        documentType: { [Op.ne]: null },
      },
      group: ['documentType'],
      order: [[fn('COUNT', col('id')), 'DESC']],
      raw: true,
    })) as unknown as Array<{ documentType: string; count: string | number }>;

    return {
      documentTypes: rows
        .filter((r) => Boolean(r.documentType))
        .map((r) => ({ value: r.documentType, count: Number(r.count) })),
    };
  }

  async findAll(companyId: number, query: QueryDocumentDto) {
    const scopedCompanyId = this.assertValidCompanyScope(companyId);
    const { page = 1, limit = 20 } = query;
    const offset = (page - 1) * limit;
    const where = buildDocumentSearchWhere(scopedCompanyId, query);

    const { rows, count } = await this.documentModel.findAndCountAll({
      where,
      limit,
      offset,
      attributes: { exclude: ['rawText'] },
      order: [['createdAt', 'DESC']],
      include: [{ model: Company, attributes: ['id', 'name', 'slug'] }],
    });

    return {
      data: rows,
      meta: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    };
  }

  async findById(id: number, companyId: number): Promise<Document> {
    const scopedCompanyId = this.assertValidCompanyScope(companyId);
    const doc = await this.documentModel.findByPk(id, {
      include: [{ model: Company, attributes: ['id', 'name', 'slug'] }],
    });

    if (!doc) {
      throw new NotFoundException(`Documento con ID ${id} no encontrado`);
    }

    if (doc.companyId !== scopedCompanyId) {
      throw new ForbiddenException('No tienes permiso para acceder a este documento');
    }

    return doc;
  }

  async reprocessDocument(
    id: number,
    companyId: number,
    actorUserId?: number,
  ) {
    const doc = await this.findById(id, companyId);
    const fullPath = resolveSafeStorageFilePath(doc.filePath, doc.companyId, doc.fileName);

    if (!existsSync(fullPath)) {
      throw new NotFoundException('El archivo PDF físico no se encuentra disponible en la bóveda');
    }

    await doc.update({
      status: DocumentStatus.PENDING,
      errorMessage: null,
    });

    this.processingQueue.enqueue(doc.id, actorUserId ?? null);

    return {
      message: `Se inició el reprocesamiento con IA de '${doc.originalName}'`,
      document: doc,
    };
  }

  async getFileStream(id: number, companyId: number) {
    const doc = await this.findById(id, companyId);
    const fullPath = resolveSafeStorageFilePath(doc.filePath, doc.companyId, doc.fileName);

    if (!existsSync(fullPath)) {
      throw new NotFoundException('El archivo físico no se encuentra en el almacenamiento');
    }

    const stream = createReadStream(fullPath);
    return { stream, document: doc };
  }

  async remove(id: number, companyId: number, actorUserId?: number) {
    const doc = await this.findById(id, companyId);
    const fullPath = resolveSafeStorageFilePath(doc.filePath, doc.companyId, doc.fileName);

    if (existsSync(fullPath)) {
      try {
        unlinkSync(fullPath);
      } catch (err: any) {
        this.logger.warn(`No se pudo eliminar el archivo físico ${fullPath}: ${err.message}`);
      }
    }

    await doc.destroy();

    await this.auditService.log({
      action: AuditAction.DELETE,
      entity: 'Document',
      entityId: id,
      companyId: doc.companyId,
      userId: actorUserId,
      description: `Se eliminó el documento PDF '${doc.originalName}'`,
    });

    return {
      success: true,
      message: `Documento '${doc.originalName}' eliminado correctamente`,
    };
  }
}
