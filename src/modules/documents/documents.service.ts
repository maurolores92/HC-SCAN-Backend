import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync, createReadStream } from 'fs';
import { extname, join } from 'path';
import * as crypto from 'crypto';
import { Document, DocumentSource, DocumentStatus } from './document.model';
import { QueryDocumentDto } from './dto/query-document.dto';
import { getTenantStoragePath } from '../../common/utils/storage-path.util';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.model';
import { NotificationsService } from '../notifications/notifications.service';
import { Company } from '../companies/company.model';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectModel(Document)
    private readonly documentModel: typeof Document,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Sube y registra un archivo PDF desde la aplicación web.
   */
  async uploadFromApp(
    file: Express.Multer.File,
    user: { id: number; companyId: number; name?: string; lastName?: string },
  ): Promise<Document> {
    if (!user.companyId) {
      throw new BadRequestException('El usuario no posee una compañía asignada');
    }

    if (!file) {
      throw new BadRequestException('El archivo PDF es requerido');
    }

    const ext = extname(file.originalname).toLowerCase();
    if (ext !== '.pdf' || file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Solo se permite la carga de archivos en formato PDF');
    }

    const tenantDir = getTenantStoragePath(user.companyId);

    const cleanBaseName = file.originalname
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    const physicalFileName = `${cleanBaseName}_${uniqueSuffix}.pdf`;
    const fullPhysicalPath = join(tenantDir, physicalFileName);

    // Escribir archivo en storage/tenancy/<companyId>/
    writeFileSync(fullPhysicalPath, file.buffer);

    // Calcular hash SHA256 para integridad
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    const relativePath = `tenancy/${user.companyId}/${physicalFileName}`;

    const document = await this.documentModel.create({
      companyId: user.companyId,
      userId: user.id,
      originalName: file.originalname,
      fileName: physicalFileName,
      filePath: relativePath,
      fileSize: file.size,
      mimeType: file.mimetype,
      source: DocumentSource.APP_UPLOAD,
      status: DocumentStatus.PENDING,
      fileHash,
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
        size: document.fileSize,
        source: document.source,
      },
      description: `Se subió el documento PDF '${document.originalName}' desde la aplicación`,
    });

    await this.notificationsService.dispatch({
      type: 'document.uploaded',
      title: '📄 Documento cargado',
      body: `Se ha subido el archivo ${document.originalName}`,
      companyId: user.companyId,
      actorUser: { id: user.id },
      extraData: { documentId: document.id },
    });

    return document;
  }

  /**
   * Escanea el directorio FTP del tenant (storage/tenancy/<companyId>) y sincroniza los PDFs no registrados.
   */
  async scanFtpFolder(companyId: number, actorUserId?: number) {
    const tenantDir = getTenantStoragePath(companyId);

    if (!existsSync(tenantDir)) {
      return { syncedCount: 0, newDocuments: [] };
    }

    const filesOnDisk = readdirSync(tenantDir);
    const pdfFiles = filesOnDisk.filter((f) => f.toLowerCase().endsWith('.pdf'));

    const existingDocs = await this.documentModel.findAll({
      where: { companyId },
      attributes: ['fileName'],
    });
    const registeredFileNames = new Set(existingDocs.map((d) => d.fileName));

    const newlyCreated: Document[] = [];

    for (const fileName of pdfFiles) {
      if (!registeredFileNames.has(fileName)) {
        const fullPath = join(tenantDir, fileName);
        const stats = statSync(fullPath);

        // Omitir archivos que se estén subiendo en ese instante (tamaño 0)
        if (stats.size === 0) continue;

        const relativePath = `tenancy/${companyId}/${fileName}`;

        const doc = await this.documentModel.create({
          companyId,
          userId: null,
          originalName: fileName,
          fileName,
          filePath: relativePath,
          fileSize: stats.size,
          mimeType: 'application/pdf',
          source: DocumentSource.FTP,
          status: DocumentStatus.PENDING,
        } as never);

        newlyCreated.push(doc);

        await this.auditService.log({
          action: AuditAction.UPLOAD,
          entity: 'Document',
          entityId: doc.id,
          companyId,
          userId: actorUserId,
          payload: {
            documentId: doc.id,
            fileName,
            size: stats.size,
            source: DocumentSource.FTP,
          },
          description: `Nuevo PDF detectado e indexado desde FTP: '${fileName}'`,
        });

        await this.notificationsService.dispatch({
          type: 'document.uploaded',
          title: '📥 Nuevo PDF recibido vía FTP',
          body: `Se detectó y registró el archivo ${fileName} desde el servidor FTP`,
          companyId,
          actorUser: { id: actorUserId },
          extraData: { documentId: doc.id },
        });
      }
    }

    this.logger.log(`FTP Scan para compañía ${companyId}: ${newlyCreated.length} nuevos documentos registrados`);

    return {
      syncedCount: newlyCreated.length,
      newDocuments: newlyCreated,
    };
  }

  async findAll(companyId: number | null, query: QueryDocumentDto, isSuperAdmin = false) {
    const { page = 1, limit = 20, search, status, source } = query;
    const offset = (page - 1) * limit;

    const where: WhereOptions<Document> = {};

    if (!isSuperAdmin && companyId) {
      where.companyId = companyId;
    } else if (isSuperAdmin && companyId) {
      where.companyId = companyId;
    }

    if (status) {
      where.status = status;
    }

    if (source) {
      where.source = source;
    }

    if (search) {
      const searchWildcard = `%${search.trim()}%`;
      where[Op.or] = [
        { originalName: { [Op.iLike ? Op.iLike : Op.like]: searchWildcard } },
        { fileName: { [Op.iLike ? Op.iLike : Op.like]: searchWildcard } },
      ];
    }

    const { rows, count } = await this.documentModel.findAndCountAll({
      where,
      limit,
      offset,
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

  async findById(id: number, companyId?: number, isSuperAdmin = false): Promise<Document> {
    const doc = await this.documentModel.findByPk(id, {
      include: [{ model: Company, attributes: ['id', 'name', 'slug'] }],
    });

    if (!doc) {
      throw new NotFoundException(`Documento con ID ${id} no encontrado`);
    }

    if (!isSuperAdmin && companyId && doc.companyId !== companyId) {
      throw new ForbiddenException('No tienes permiso para acceder a este documento');
    }

    return doc;
  }

  async getFileStream(id: number, companyId?: number, isSuperAdmin = false) {
    const doc = await this.findById(id, companyId, isSuperAdmin);
    const tenantDir = getTenantStoragePath(doc.companyId);
    const fullPath = join(tenantDir, doc.fileName);

    if (!existsSync(fullPath)) {
      throw new NotFoundException('El archivo físico no se encuentra en el almacenamiento');
    }

    const stream = createReadStream(fullPath);
    return {
      stream,
      document: doc,
    };
  }

  async remove(id: number, companyId?: number, actorUserId?: number, isSuperAdmin = false) {
    const doc = await this.findById(id, companyId, isSuperAdmin);

    const tenantDir = getTenantStoragePath(doc.companyId);
    const fullPath = join(tenantDir, doc.fileName);

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

