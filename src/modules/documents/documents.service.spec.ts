import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BadRequestException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { Document, DocumentSource, DocumentStatus } from './document.model';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let documentModelMock: any;
  let auditServiceMock: any;
  let notificationsServiceMock: any;

  beforeEach(async () => {
    documentModelMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findByPk: jest.fn(),
      findAndCountAll: jest.fn(),
    };

    auditServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    notificationsServiceMock = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: getModelToken(Document),
          useValue: documentModelMock,
        },
        {
          provide: AuditService,
          useValue: auditServiceMock,
        },
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  it('debe estar definido el servicio', () => {
    expect(service).toBeDefined();
  });

  it('debe rechazar la subida si el archivo no es PDF', async () => {
    const mockFile = {
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('fake'),
      size: 100,
    } as Express.Multer.File;

    await expect(
      service.uploadFromApp(mockFile, { id: 1, companyId: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe rechazar la subida si el usuario no tiene compañía', async () => {
    const mockFile = {
      originalname: 'documento.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('fake pdf'),
      size: 100,
    } as Express.Multer.File;

    await expect(
      service.uploadFromApp(mockFile, { id: 1, companyId: 0 }),
    ).rejects.toThrow(BadRequestException);
  });
});

