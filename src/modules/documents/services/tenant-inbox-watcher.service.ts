import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import * as chokidar from 'chokidar';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, extname, join } from 'path';
import { Company } from '../../companies/company.model';
import { Document, DocumentSource, DocumentStatus } from '../document.model';
import { TenantQuotasService } from '../../plans/services/tenant-quotas.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/audit.model';
import { NotificationsService } from '../../notifications/notifications.service';
import { DocumentProcessingQueueService } from './document-processing-queue.service';
import {
  ensureTenantDirectories,
  getStorageRootPath,
} from '../../../common/utils/storage-path.util';
import {
  computeBufferSha256,
  isValidPdfBufferHeader,
  moveInboxFileToQuarantine,
  moveInboxFileToVault,
} from '../helpers/document-storage.helper';

export interface InboxSyncSummary {
  syncedCount: number;
  imported: number;
  skippedByQuotaCount: number;
  duplicatesCount: number;
  invalidCount: number;
  quotaReached: boolean;
  quotaMessage?: string;
  newDocuments: Document[];
}

/**
 * Servicio Watcher en tiempo real (`chokidar`) que observa `storage/tenancy/company_<id>/inbox`
 * para detectar PDFs enviados por impresoras HP vía SFTP o copiados localmente en disco.
 */
@Injectable()
export class TenantInboxWatcherService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TenantInboxWatcherService.name);
  private watcher: chokidar.FSWatcher | null = null;
  private readonly watchedCompanyIds = new Set<number>();
  private readonly processingPaths = new Set<string>();

  constructor(
    @InjectModel(Company) private readonly companyModel: typeof Company,
    @InjectModel(Document) private readonly documentModel: typeof Document,
    private readonly tenantQuotasService: TenantQuotasService,
    private readonly processingQueue: DocumentProcessingQueueService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_INBOX_WATCHER === 'true') {
      return;
    }

    try {
      const companies = await this.companyModel.findAll({ attributes: ['id'] });
      const tenancyRoot = join(getStorageRootPath(), 'tenancy');
      if (!existsSync(tenancyRoot)) {
        mkdirSync(tenancyRoot, { recursive: true });
      }

      for (const comp of companies) {
        ensureTenantDirectories(comp.id);
        this.watchedCompanyIds.add(comp.id);
      }

      this.watcher = chokidar.watch(tenancyRoot, {
        persistent: true,
        ignoreInitial: false,
        depth: 3,
        awaitWriteFinish: {
          stabilityThreshold: 2500,
          pollInterval: 300,
        },
        ignored: /(^|[\/\\])\..|[\/\\](vault|quarantine)([\/\\]|$)|(\.part|\.tmp|\.crdownload|desktop\.ini)$/i,
      });

      this.watcher.on('add', (filePath: string) => {
        this.handleDetectedFile(filePath).catch((err) => {
          this.logger.error(`Error procesando archivo detectado '${filePath}': ${err?.message}`);
        });
      });

      this.logger.log(
        `👁️ Watcher SFTP/Local activo sobre storage/tenancy (${companies.length} compañía(s) aprovisionadas)`,
      );
    } catch (err: any) {
      this.logger.error(`No se pudo iniciar TenantInboxWatcherService: ${err?.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Aprovisiona y registra en caliente el directorio `inbox/` de una nueva compañía sin reiniciar NestJS.
   */
  registerTenantInbox(companyId: number): string {
    const { inboxDir } = ensureTenantDirectories(companyId);
    if (!this.watchedCompanyIds.has(companyId)) {
      this.watchedCompanyIds.add(companyId);
      if (this.watcher) {
        this.watcher.add(inboxDir);
        this.logger.log(`Nueva bandeja inbox registrada en vivo para company_${companyId}`);
      }
    }
    return inboxDir;
  }

  /**
   * Escanea bajo demanda todos los archivos presentes en `storage/tenancy/company_<id>/inbox`.
   */
  async scanTenantInbox(
    companyId: number,
    actorUserId?: number,
  ): Promise<InboxSyncSummary> {
    const { inboxDir } = ensureTenantDirectories(companyId);
    const summary: InboxSyncSummary = {
      syncedCount: 0,
      imported: 0,
      skippedByQuotaCount: 0,
      duplicatesCount: 0,
      invalidCount: 0,
      quotaReached: false,
      newDocuments: [],
    };

    if (!existsSync(inboxDir)) return summary;

    const entries = readdirSync(inboxDir);
    for (const entry of entries) {
      if (entry.startsWith('.') || /\.(part|tmp|crdownload)$/i.test(entry)) continue;
      const fullPath = join(inboxDir, entry);
      if (!existsSync(fullPath)) continue;

      const stats = statSync(fullPath);
      if (!stats.isFile()) continue;

      const outcome = await this.ingestSingleInboxFile(companyId, fullPath, actorUserId, false);
      if (outcome.status === 'imported' && outcome.document) {
        summary.syncedCount++;
        summary.imported++;
        summary.newDocuments.push(outcome.document);
      } else if (outcome.status === 'quota_exceeded') {
        summary.skippedByQuotaCount++;
        summary.quotaReached = true;
        if (!summary.quotaMessage) summary.quotaMessage = outcome.reason;
      } else if (outcome.status === 'duplicate') {
        summary.duplicatesCount++;
      } else if (outcome.status === 'invalid') {
        summary.invalidCount++;
      }
    }

    if (summary.skippedByQuotaCount > 0 && summary.quotaMessage) {
      await this.tenantQuotasService.notifyQuotaExceeded(
        companyId,
        `${summary.quotaMessage} (${summary.skippedByQuotaCount} archivo(s) movidos a cuarentena).`,
      );
    }

    return summary;
  }

  private extractCompanyIdFromPath(filePath: string): number | null {
    const normalized = filePath.replace(/\\/g, '/');
    const match = normalized.match(/\/tenancy\/company_(\d+)\/inbox\/[^/]+$/);
    return match ? Number(match[1]) : null;
  }

  private async handleDetectedFile(filePath: string): Promise<void> {
    const companyId = this.extractCompanyIdFromPath(filePath);
    if (!companyId) return;

    await this.ingestSingleInboxFile(companyId, filePath, undefined, true);
  }

  async ingestSingleInboxFile(
    companyId: number,
    fullPath: string,
    actorUserId?: number,
    notifyQuotaImmediately = true,
  ): Promise<{
    status: 'imported' | 'duplicate' | 'invalid' | 'quota_exceeded' | 'skipped';
    document?: Document;
    reason?: string;
  }> {
    if (this.processingPaths.has(fullPath) || !existsSync(fullPath)) {
      return { status: 'skipped' };
    }

    this.processingPaths.add(fullPath);
    try {
      const originalName = basename(fullPath);
      const ext = extname(originalName).toLowerCase();
      const stats = statSync(fullPath);

      if (ext !== '.pdf' || stats.size === 0) {
        moveInboxFileToQuarantine(companyId, fullPath, 'invalid');
        return { status: 'invalid', reason: 'Extensión no PDF o archivo vacío' };
      }

      const fileBuffer = readFileSync(fullPath);
      if (!isValidPdfBufferHeader(fileBuffer)) {
        moveInboxFileToQuarantine(companyId, fullPath, 'invalid');
        return { status: 'invalid', reason: 'Cabecera binaria PDF inválida' };
      }

      const fileHash = computeBufferSha256(fileBuffer);
      const duplicate = await this.documentModel.findOne({
        where: { companyId, fileHash },
        attributes: ['id', 'originalName'],
      });

      if (duplicate) {
        moveInboxFileToQuarantine(companyId, fullPath, 'duplicate');
        this.logger.warn(
          `[Inbox company_${companyId}] PDF duplicado detectado ('${originalName}' == doc #${duplicate.id}); movido a quarantine.`,
        );
        return { status: 'duplicate' };
      }

      const quotaCheck = await this.tenantQuotasService.checkDocumentQuota(
        companyId,
        stats.size,
      );
      if (!quotaCheck.allowed) {
        moveInboxFileToQuarantine(companyId, fullPath, 'quota');
        if (notifyQuotaImmediately && quotaCheck.reason) {
          await this.tenantQuotasService.notifyQuotaExceeded(companyId, quotaCheck.reason);
        }
        return { status: 'quota_exceeded', reason: quotaCheck.reason };
      }

      const moved = moveInboxFileToVault(companyId, fullPath, originalName);
      const doc = await this.documentModel.create({
        companyId,
        userId: actorUserId ?? null,
        originalName,
        fileName: moved.physicalFileName,
        filePath: moved.relativePath,
        fileSize: moved.fileSize,
        mimeType: 'application/pdf',
        source: DocumentSource.FTP,
        status: DocumentStatus.PENDING,
        fileHash: moved.fileHash,
      } as never);

      await this.auditService.log({
        action: AuditAction.UPLOAD,
        entity: 'Document',
        entityId: doc.id,
        companyId,
        userId: actorUserId,
        payload: {
          documentId: doc.id,
          originalName,
          filePath: moved.relativePath,
          size: moved.fileSize,
          source: DocumentSource.FTP,
        },
        description: `PDF detectado automáticamente en inbox y almacenado en bóveda: '${originalName}'`,
      });

      await this.notificationsService.dispatch({
        type: 'document.uploaded',
        title: '📥 Nuevo PDF detectado en carpeta / SFTP',
        body: `Se recibió '${originalName}' y comenzó su extracción inteligente con IA`,
        companyId,
        actorUser: actorUserId ? { id: actorUserId } : null,
        extraData: { documentId: doc.id, link: '/documents' },
      });

      this.processingQueue.enqueue(doc.id, actorUserId ?? null);

      return { status: 'imported', document: doc };
    } finally {
      this.processingPaths.delete(fullPath);
    }
  }
}
