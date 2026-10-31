import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { TenantQuotasService } from './tenant-quotas.service';
import { CompanyQuotaSummaryService } from './company-quota-summary.service';
import { Company, CompanyStatus } from '../../companies/company.model';
import { Users } from '../../users/users.model';
import { Document } from '../../documents/document.model';
import { CompanyMonthlyUsage } from '../models/company-monthly-usage.model';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';

describe('TenantQuotasService', () => {
  let service: TenantQuotasService;
  let companyModelMock: any;
  let userModelMock: any;
  let documentModelMock: any;
  let monthlyUsageModelMock: any;
  let notificationsServiceMock: any;
  let auditServiceMock: any;
  let sequelizeMock: any;

  beforeEach(async () => {
    companyModelMock = {
      findByPk: jest.fn(),
    };
    userModelMock = {
      count: jest.fn(),
      findAll: jest.fn(),
    };
    documentModelMock = {
      findAll: jest.fn(),
    };
    monthlyUsageModelMock = {
      findOne: jest.fn(),
      findAll: jest.fn(),
      findOrCreate: jest.fn(),
    };
    notificationsServiceMock = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    auditServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    sequelizeMock = {
      transaction: jest.fn().mockResolvedValue({
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantQuotasService,
        CompanyQuotaSummaryService,
        { provide: getModelToken(Company), useValue: companyModelMock },
        { provide: getModelToken(Users), useValue: userModelMock },
        { provide: getModelToken(Document), useValue: documentModelMock },
        { provide: getModelToken(CompanyMonthlyUsage), useValue: monthlyUsageModelMock },
        { provide: Sequelize, useValue: sequelizeMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: AuditService, useValue: auditServiceMock },
      ],
    }).compile();

    service = module.get<TenantQuotasService>(TenantQuotasService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe bloquear la creación de usuario cuando se alcanza el límite del plan asociado', async () => {
    // Arrange
    companyModelMock.findByPk.mockResolvedValueOnce({
      id: 10,
      name: 'Acme S.A.',
      status: CompanyStatus.ACTIVE,
      useCustomLimits: false,
      plan: {
        maxUsers: 5,
        maxDocuments: 500,
        maxStorageMb: 2048,
        maxAiQueriesMonthly: 250,
      },
    });
    userModelMock.count.mockResolvedValueOnce(5);

    // Act & Assert
    await expect(service.assertCanCreateOrActivateUser(10)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('debe permitir usuarios ilimitados cuando el plan define maxUsers en null', async () => {
    // Arrange
    companyModelMock.findByPk.mockResolvedValueOnce({
      id: 11,
      name: 'Enterprise Corp',
      status: CompanyStatus.ACTIVE,
      useCustomLimits: false,
      plan: {
        maxUsers: null,
        maxDocuments: null,
        maxStorageMb: null,
        maxAiQueriesMonthly: null,
      },
    });

    // Act & Assert
    await expect(service.assertCanCreateOrActivateUser(11)).resolves.toBeUndefined();
    expect(userModelMock.count).not.toHaveBeenCalled();
  });

  it('debe bloquear la subida de documento si supera maxStorageMb del plan', async () => {
    // Arrange
    companyModelMock.findByPk.mockResolvedValueOnce({
      id: 12,
      name: 'Pyme Docs',
      status: CompanyStatus.ACTIVE,
      useCustomLimits: false,
      plan: {
        maxUsers: 5,
        maxDocuments: 100,
        maxStorageMb: 10,
        maxAiQueriesMonthly: 100,
      },
    });
    documentModelMock.findAll.mockResolvedValueOnce([
      { docsCount: 2, totalBytes: 9 * 1024 * 1024 },
    ]);

    // Act & Assert
    await expect(
      service.assertCanStoreDocument(12, 3 * 1024 * 1024),
    ).rejects.toThrow(BadRequestException);
    expect(notificationsServiceMock.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'company.quota_exceeded', companyId: 12 }),
    );
  });

  it('debe bloquear consultas de IA cuando se alcanza el cupo mensual y permitir consumir si hay saldo', async () => {
    // Arrange (bloqueado al tope)
    companyModelMock.findByPk.mockResolvedValueOnce({
      id: 15,
      name: 'AI Tenant',
      status: CompanyStatus.ACTIVE,
      useCustomLimits: false,
      plan: {
        maxUsers: 5,
        maxDocuments: 100,
        maxStorageMb: 1024,
        maxAiQueriesMonthly: 10,
      },
    });
    monthlyUsageModelMock.findOne.mockResolvedValueOnce({ aiQueriesCount: 10 });

    // Act & Assert (bloqueo)
    await expect(service.assertCanExecuteAiQuery(15)).rejects.toThrow(
      ForbiddenException,
    );

    // Arrange (consumo exitoso con saldo disponible)
    const usageRecordMock = {
      aiQueriesCount: 4,
      tokensUsed: 1500,
      increment: jest.fn().mockResolvedValue(undefined),
      reload: jest.fn().mockResolvedValue(undefined),
    };
    companyModelMock.findByPk.mockResolvedValue({
      id: 15,
      name: 'AI Tenant',
      status: CompanyStatus.ACTIVE,
      useCustomLimits: false,
      plan: {
        maxUsers: 5,
        maxDocuments: 100,
        maxStorageMb: 1024,
        maxAiQueriesMonthly: 10,
      },
    });
    monthlyUsageModelMock.findOne.mockResolvedValueOnce({ aiQueriesCount: 3 });
    monthlyUsageModelMock.findOrCreate.mockResolvedValueOnce([usageRecordMock, false]);

    // Act
    const usage = await service.consumeAiQuery(15, { tokensUsed: 500, actorUserId: 1 });

    // Assert
    expect(usageRecordMock.increment).toHaveBeenCalledWith(
      { aiQueriesCount: 1, aiDocumentsProcessed: 0, tokensUsed: 500 },
      expect.any(Object),
    );
    expect(usage).toBe(usageRecordMock);
    expect(auditServiceMock.log).toHaveBeenCalledTimes(1);
  });

  it('debe contabilizar aiDocumentsProcessed al procesar un PDF sin descontar consultas de Chat IA', async () => {
    // Arrange
    const usageRecordMock = {
      aiQueriesCount: 2,
      aiDocumentsProcessed: 5,
      tokensUsed: 1200,
      increment: jest.fn().mockResolvedValue(undefined),
      reload: jest.fn().mockResolvedValue(undefined),
    };
    monthlyUsageModelMock.findOrCreate.mockResolvedValueOnce([usageRecordMock, false]);

    // Act
    const result = await service.recordDocumentAiProcessing(20, { tokensUsed: 840 });

    // Assert
    expect(usageRecordMock.increment).toHaveBeenCalledWith(
      { aiDocumentsProcessed: 1, tokensUsed: 840 },
      expect.any(Object),
    );
    expect(result).toBe(usageRecordMock);
  });
});
