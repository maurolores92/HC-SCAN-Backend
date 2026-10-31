import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BadRequestException } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import { existsSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { TenantInboxWatcherService } from './tenant-inbox-watcher.service';
import { Company } from '../../companies/company.model';
import { Document } from '../document.model';
import { TenantQuotasService } from '../../plans/services/tenant-quotas.service';
import { DocumentProcessingQueueService } from './document-processing-queue.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  ensureTenantDirectories,
  sanitizeTenantId,
} from '../../../common/utils/storage-path.util';

describe('TenantInboxWatcherService & Multitenant Storage Isolation', () => {
  let service: TenantInboxWatcherService;
  let documentModelMock: any;
  let tenantQuotasMock: any;
  let processingQueueMock: any;
  let tempStorageDir: string;

  beforeEach(async () => {
    tempStorageDir = path.join(os.tmpdir(), `hc-scan-inbox-spec-${Date.now()}`);
    process.env.STORAGE_ROOT_PATH = tempStorageDir;

    documentModelMock = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (payload) => ({
        id: 501,
        ...payload,
      })),
    };

    tenantQuotasMock = {
      checkDocumentQuota: jest.fn().mockResolvedValue({ allowed: true }),
      notifyQuotaExceeded: jest.fn().mockResolvedValue(undefined),
    };

    processingQueueMock = {
      enqueue: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantInboxWatcherService,
        { provide: getModelToken(Company), useValue: { findAll: jest.fn().mockResolvedValue([]) } },
        { provide: getModelToken(Document), useValue: documentModelMock },
        { provide: TenantQuotasService, useValue: tenantQuotasMock },
        { provide: DocumentProcessingQueueService, useValue: processingQueueMock },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: NotificationsService,
          useValue: { dispatch: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<TenantInboxWatcherService>(TenantInboxWatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    try {
      rmSync(tempStorageDir, { recursive: true, force: true });
    } catch {}
  });

  it('debe crear las subcarpetas aisladas inbox, vault y quarantine y bloquear intentos de Path Traversal', () => {
    // Arrange & Act
    const dirs = ensureTenantDirectories(7);

    // Assert
    expect(existsSync(dirs.inboxDir)).toBe(true);
    expect(existsSync(dirs.vaultDir)).toBe(true);
    expect(existsSync(dirs.quarantineDir)).toBe(true);
    expect(() => sanitizeTenantId('../etc/passwd')).toThrow(BadRequestException);
    expect(() => sanitizeTenantId(0)).toThrow(BadRequestException);
  });

  it('debe mover un PDF válido desde inbox hacia vault/YYYY/MM, persistirlo y encolar extracción IA', async () => {
    // Arrange
    const { inboxDir } = ensureTenantDirectories(4);
    const incomingPdfPath = path.join(inboxDir, 'HP_LaserJet_Scan_01.pdf');
    writeFileSync(incomingPdfPath, Buffer.from('%PDF-1.4 escaneo impresora HP'));

    // Act
    const summary = await service.scanTenantInbox(4, 15);

    // Assert
    expect(summary.imported).toBe(1);
    expect(existsSync(incomingPdfPath)).toBe(false);
    expect(documentModelMock.create).toHaveBeenCalledTimes(1);
    expect(processingQueueMock.enqueue).toHaveBeenCalledWith(501, 15);
  });

  it('debe enviar a quarantine los archivos duplicados o rechazados por cupo de almacenamiento', async () => {
    // Arrange
    const { inboxDir, quarantineDir } = ensureTenantDirectories(8);
    const dupPath = path.join(inboxDir, 'duplicado.pdf');
    const quotaPath = path.join(inboxDir, 'excede_cupo.pdf');
    writeFileSync(dupPath, Buffer.from('%PDF-1.4 archivo 1'));
    writeFileSync(quotaPath, Buffer.from('%PDF-1.4 archivo 2'));

    documentModelMock.findOne
      .mockResolvedValueOnce({ id: 99, originalName: 'duplicado_previo.pdf' })
      .mockResolvedValueOnce(null);

    tenantQuotasMock.checkDocumentQuota.mockResolvedValueOnce({
      allowed: false,
      reason: 'Se alcanzó el tope de documentos del plan.',
    });

    // Act
    const summary = await service.scanTenantInbox(8);

    // Assert
    expect(summary.imported).toBe(0);
    expect(summary.duplicatesCount).toBe(1);
    expect(summary.skippedByQuotaCount).toBe(1);
    const quarantinedFiles = readdirSync(quarantineDir);
    expect(quarantinedFiles.length).toBe(2);
  });
});

