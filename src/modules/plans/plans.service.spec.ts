import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { PlansService } from './plans.service';
import { Plan } from './plan.model';
import { Company } from '../companies/company.model';
import { AuditService } from '../audit/audit.service';

describe('PlansService', () => {
  let service: PlansService;
  let planModelMock: any;
  let companyModelMock: any;
  let auditServiceMock: any;
  let sequelizeMock: any;

  beforeEach(async () => {
    planModelMock = {
      findOne: jest.fn(),
      findByPk: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    companyModelMock = {
      findAll: jest.fn(),
      count: jest.fn(),
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
        PlansService,
        { provide: getModelToken(Plan), useValue: planModelMock },
        { provide: getModelToken(Company), useValue: companyModelMock },
        { provide: Sequelize, useValue: sequelizeMock },
        { provide: AuditService, useValue: auditServiceMock },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe crear un plan por defecto desmarcando otros planes predeterminados', async () => {
    // Arrange
    planModelMock.findOne.mockResolvedValueOnce(null);
    const createdPlan = {
      id: 2,
      name: 'Profesional',
      slug: 'pro',
      isDefault: true,
      toJSON: () => ({ id: 2, name: 'Profesional', slug: 'pro', isDefault: true }),
    };
    planModelMock.create.mockResolvedValueOnce(createdPlan);

    // Act
    const result = await service.create(
      {
        name: 'Profesional',
        slug: 'pro',
        maxUsers: 15,
        maxDocuments: 5000,
        maxStorageMb: 10240,
        maxAiQueriesMonthly: 2000,
        isDefault: true,
      },
      1,
    );

    // Assert
    expect(result).toEqual(createdPlan);
    expect(planModelMock.update).toHaveBeenCalledWith(
      { isDefault: false },
      expect.objectContaining({ where: { isDefault: true } }),
    );
    expect(auditServiceMock.log).toHaveBeenCalledTimes(1);
  });

  it('debe lanzar BadRequestException si el slug del plan ya existe', async () => {
    // Arrange
    planModelMock.findOne.mockResolvedValueOnce({ id: 1, slug: 'starter' });

    // Act & Assert
    await expect(
      service.create({ name: 'Starter', slug: 'starter' }, 1),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe impedir eliminar un plan que tiene compañías asociadas', async () => {
    // Arrange
    planModelMock.findByPk.mockResolvedValueOnce({
      id: 1,
      name: 'Starter',
      destroy: jest.fn(),
    });
    companyModelMock.count.mockResolvedValueOnce(3);

    // Act & Assert
    await expect(service.remove(1, 1)).rejects.toThrow(BadRequestException);
  });

  it('debe lanzar NotFoundException al buscar un plan inexistente', async () => {
    // Arrange
    planModelMock.findByPk.mockResolvedValueOnce(null);

    // Act & Assert
    await expect(service.findById(999)).rejects.toThrow(NotFoundException);
  });
});

