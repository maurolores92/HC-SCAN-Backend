import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Document, DocumentStatus } from '../document.model';
import { DocumentAiExtractorService } from './document-ai-extractor.service';
import { TenantQuotasService } from '../../plans/services/tenant-quotas.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/audit.model';
import { resolveSafeStorageFilePath } from '../../../common/utils/storage-path.util';

interface QueuedDocumentJob {
  documentId: number;
  actorUserId?: number | null;
}

const MAX_CONCURRENT_EXTRACTIONS = 2;

/**
 * Cola asíncrona controlada para procesar la extracción OCR/IA de PDFs
 * sin saturar la memoria ni el CPU del servidor ante ráfagas de escaneos SFTP.
 */
@Injectable()
export class DocumentProcessingQueueService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DocumentProcessingQueueService.name);
  private readonly queue: QueuedDocumentJob[] = [];
  private readonly enqueuedIds = new Set<number>();
  private activeWorkers = 0;

  constructor(
    @InjectModel(Document)
    private readonly documentModel: typeof Document,
    private readonly extractorService: DocumentAiExtractorService,
    private readonly tenantQuotasService: TenantQuotasService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;

    try {
      const pendingDocs = await this.documentModel.findAll({
        where: {
          status: { [Op.in]: [DocumentStatus.PENDING, DocumentStatus.PROCESSING] },
        },
        attributes: ['id'],
        order: [['createdAt', 'ASC']],
        limit: 50,
      });

      for (const doc of pendingDocs) {
        this.enqueue(doc.id, null);
      }
    } catch (err: any) {
      this.logger.warn(`No se pudieron re-encolar documentos pendientes al inicio: ${err?.message}`);
    }
  }

  enqueue(documentId: number, actorUserId?: number | null): void {
    if (this.enqueuedIds.has(documentId)) return;
    this.enqueuedIds.add(documentId);
    this.queue.push({ documentId, actorUserId });
    setImmediate(() => this.drainQueue());
  }

  private drainQueue(): void {
    while (this.activeWorkers < MAX_CONCURRENT_EXTRACTIONS && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.activeWorkers++;

      this.processDocumentNow(job.documentId, job.actorUserId)
        .catch((err) => {
          this.logger.error(
            `Error no controlado en cola de documento #${job.documentId}: ${err?.message}`,
          );
        })
        .finally(() => {
          this.enqueuedIds.delete(job.documentId);
          this.activeWorkers--;
          if (this.queue.length > 0) {
            setImmediate(() => this.drainQueue());
          }
        });
    }
  }

  async processDocumentNow(
    documentId: number,
    actorUserId?: number | null,
  ): Promise<Document | null> {
    const doc = await this.documentModel.findByPk(documentId);
    if (!doc) return null;

    await doc.update({
      status: DocumentStatus.PROCESSING,
      errorMessage: null,
    });

    try {
      const fullPath = resolveSafeStorageFilePath(
        doc.filePath,
        doc.companyId,
        doc.fileName,
      );

      const extraction = await this.extractorService.extractFromFile(
        fullPath,
        doc.originalName,
      );

      await doc.update({
        status: DocumentStatus.PROCESSED,
        documentType: extraction.documentType,
        summary: extraction.summary,
        documentNumber: extraction.documentNumber,
        documentDate: extraction.documentDate,
        issuerName: extraction.issuerName,
        issuerTaxId: extraction.issuerTaxId,
        recipientName: extraction.recipientName,
        responsiblePerson: extraction.responsiblePerson,
        currency: extraction.currency,
        totalAmount: extraction.totalAmount,
        tags: extraction.tags,
        extractedData: extraction.extractedData,
        rawText: extraction.rawText,
        pageCount: extraction.pageCount,
        aiConfidence: extraction.aiConfidence,
        extractionEngine: extraction.extractionEngine,
        processedAt: new Date(),
        errorMessage: null,
      });

      // Contabiliza el documento procesado en `aiDocumentsProcessed` sin gastar `maxAiQueriesMonthly`
      await this.tenantQuotasService.recordDocumentAiProcessing(doc.companyId, {
        tokensUsed: extraction.tokensUsed,
      });

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entity: 'Document',
        entityId: doc.id,
        companyId: doc.companyId,
        userId: actorUserId ?? doc.userId ?? undefined,
        payload: {
          documentType: extraction.documentType,
          extractionEngine: extraction.extractionEngine,
          pageCount: extraction.pageCount,
          tokensUsed: extraction.tokensUsed,
        },
        description: `Extracción IA completada (${extraction.documentType}) para '${doc.originalName}'`,
      });

      const readableType = (extraction.documentType || 'documento').replace(/_/g, ' ');
      await this.notificationsService.dispatch({
        type: 'document.processed',
        title: `✨ Documento indexado (${readableType})`,
        body: extraction.issuerName
          ? `${doc.originalName} — Emisor: ${extraction.issuerName}`
          : `${doc.originalName} ya está listo para consultar`,
        companyId: doc.companyId,
        targetUserId: actorUserId ?? doc.userId ?? null,
        extraData: {
          documentId: doc.id,
          documentType: extraction.documentType,
          link: '/documents',
        },
      });

      return doc;
    } catch (error: any) {
      const errMsg = error?.message || 'Fallo desconocido durante el análisis del PDF';
      this.logger.error(`Fallo procesando documento #${doc.id}: ${errMsg}`);

      await doc.update({
        status: DocumentStatus.ERROR,
        errorMessage: errMsg,
      });

      await this.notificationsService.dispatch({
        type: 'document.error',
        title: '⚠️ Error al procesar PDF',
        body: `No se pudo analizar '${doc.originalName}': ${errMsg}`,
        companyId: doc.companyId,
        targetUserId: actorUserId ?? doc.userId ?? null,
        extraData: { documentId: doc.id, link: '/documents' },
      });

      return doc;
    }
  }
}

