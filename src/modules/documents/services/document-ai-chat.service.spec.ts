import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DocumentAiChatService } from './document-ai-chat.service';
import { Document } from '../document.model';
import { AuditService } from '../../audit/audit.service';
import { TenantQuotasService } from '../../plans/services/tenant-quotas.service';

describe('DocumentAiChatService', () => {
  let service: DocumentAiChatService;
  let documentModelMock: any;
  let auditServiceMock: any;
  let tenantQuotasServiceMock: any;

  beforeEach(async () => {
    documentModelMock = {
      findOne: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
    };

    auditServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    tenantQuotasServiceMock = {
      assertCanExecuteAiQuery: jest.fn().mockResolvedValue(undefined),
      consumeAiQuery: jest.fn().mockResolvedValue(undefined),
      getCompanyQuotaSummary: jest.fn().mockResolvedValue({
        aiQueries: { current: 5, max: 200, unlimited: false, percentage: 2.5 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentAiChatService,
        { provide: getModelToken(Document), useValue: documentModelMock },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: TenantQuotasService, useValue: tenantQuotasServiceMock },
      ],
    }).compile();

    service = module.get<DocumentAiChatService>(DocumentAiChatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido el servicio de chat documental', () => {
    expect(service).toBeDefined();
  });

  it('debe rechazar consultas si el usuario no tiene compañía asociada', async () => {
    const userWithoutCompany = { id: 1, role: 'superadmin', companyId: null };
    await expect(
      service.chat({ message: '¿Total de gastos?' }, userWithoutCompany),
    ).rejects.toThrow(ForbiddenException);
  });

  it('debe responder con análisis y consumir cupo en consulta general', async () => {
    const user = { id: 10, role: 'company_admin', companyId: 2 };
    const mockDoc = {
      id: 1,
      originalName: 'Factura_123.pdf',
      documentType: 'factura',
      issuerName: 'TechCorp',
      totalAmount: 15000,
      currency: 'ARS',
      documentDate: '2026-10-15',
      summary: 'Factura por servicios informáticos',
    };
    documentModelMock.findAll.mockResolvedValueOnce([mockDoc]);

    const result = await service.chat({ message: '¿Cuáles son las facturas?' }, user);

    expect(result).toBeDefined();
    expect(result.reply).toBeDefined();
    expect(result.referencedDocuments).toHaveLength(1);
    expect(result.referencedDocuments[0].originalName).toBe('Factura_123.pdf');
    expect(tenantQuotasServiceMock.assertCanExecuteAiQuery).toHaveBeenCalledWith(2);
    expect(tenantQuotasServiceMock.consumeAiQuery).toHaveBeenCalledWith(2, expect.any(Object));
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 2, userId: 10 }),
    );
  });

  it('debe lanzar NotFoundException si se consulta un documentId inexistente en la compañía', async () => {
    const user = { id: 10, role: 'company_admin', companyId: 2 };
    documentModelMock.findOne.mockResolvedValueOnce(null);

    await expect(
      service.chat({ message: '¿Quién firma?', documentId: 999 }, user),
    ).rejects.toThrow(NotFoundException);
  });
});

