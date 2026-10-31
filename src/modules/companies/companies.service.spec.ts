import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BadRequestException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { CompaniesService } from './companies.service';
import { Company } from './company.model';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlansService } from '../plans/plans.service';
import { TenantQuotasService } from '../plans/services/tenant-quotas.service';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let companyModelMock: any;
  let auditServiceMock: any;
  let notificationsServiceMock: any;
  let plansServiceMock: any;
  let tenantQuotasServiceMock: any;
  let sequelizeMock: any;

  beforeEach(async () => {
    companyModelMock = {
      findOne: jest.fn(),
      findByPk: jest.fn(),
      create: jest.fn(),
      findAndCountAll: jest.fn(),
    };

    auditServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    notificationsServiceMock = {
      notifyUser: jest.fn().mockResolvedValue(undefined),
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    plansServiceMock = {
      findById: jest.fn(),
      findDefaultPlan: jest.fn().mockResolvedValue({
        id: 2,
        name: 'Profesional',
        slug: 'pro',
        maxUsers: 15,
        includedModules: ['documents', 'users'],
      }),
    };

    tenantQuotasServiceMock = {
      getBatchQuotaSummaries: jest.fn().mockResolvedValue(new Map()),
    };

    sequelizeMock = {
      transaction: jest.fn().mockReturnValue({
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: getModelToken(Company), useValue: companyModelMock },
        { provide: Sequelize, useValue: sequelizeMock },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: PlansService, useValue: plansServiceMock },
        { provide: TenantQuotasService, useValue: tenantQuotasServiceMock },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido el servicio', () => {
    expect(service).toBeDefined();
  });

  it('debe lanzar BadRequestException si el slug ya existe', async () => {
    // Arrange
    companyModelMock.findOne.mockResolvedValueOnce({ id: 1, slug: 'empresa-test' });

    // Act & Assert
    await expect(
      service.create({
        name: 'Empresa Test',
        slug: 'empresa-test',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe retornar lista de compañías con resumen de cuota y meta paginado', async () => {
    // Arrange
    companyModelMock.findAndCountAll.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          name: 'Compañía Uno',
          slug: 'comp-uno',
          toJSON: () => ({ id: 1, name: 'Compañía Uno', slug: 'comp-uno' }),
        },
      ],
      count: 1,
    });

    const summaryMap = new Map();
    summaryMap.set(1, {
      companyId: 1,
      users: { current: 3, max: 15, unlimited: false, percentage: 20 },
      documents: { current: 10, max: 500, unlimited: false, percentage: 2 },
      storageMb: { current: 12.5, max: 2048, unlimited: false, percentage: 1, currentBytes: 13107200 },
      aiQueries: { current: 0, max: 250, unlimited: false, percentage: 0, period: '2026-10', tokensUsed: 0 },
    });
    tenantQuotasServiceMock.getBatchQuotaSummaries.mockResolvedValueOnce(summaryMap);

    // Act
    const result = await service.findAll({ page: 1, limit: 10 });

    // Assert
    expect(result.data).toHaveLength(1);
    expect(result.data[0].activeUsersCount).toBe(3);
    expect(result.data[0].quotaSummary.documents.current).toBe(10);
    expect(result.meta.totalItems).toBe(1);
  });
});
