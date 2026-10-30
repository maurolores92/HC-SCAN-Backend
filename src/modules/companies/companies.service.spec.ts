import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BadRequestException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { CompaniesService } from './companies.service';
import { Company, CompanyStatus } from './company.model';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../role/role.model';
import { Users } from '../users/users.model';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let companyModelMock: any;
  let auditServiceMock: any;
  let notificationsServiceMock: any;
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

    sequelizeMock = {
      transaction: jest.fn().mockReturnValue({
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        {
          provide: getModelToken(Company),
          useValue: companyModelMock,
        },
        {
          provide: Sequelize,
          useValue: sequelizeMock,
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

    service = module.get<CompaniesService>(CompaniesService);
  });

  it('debe estar definido el servicio', () => {
    expect(service).toBeDefined();
  });

  it('debe lanzar BadRequestException si el slug ya existe', async () => {
    companyModelMock.findOne.mockResolvedValueOnce({ id: 1, slug: 'empresa-test' });

    await expect(
      service.create({
        name: 'Empresa Test',
        slug: 'empresa-test',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe retornar lista de compañías con meta paginado', async () => {
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

    jest.spyOn(Users, 'count').mockResolvedValueOnce(3 as never);

    const result = await service.findAll({ page: 1, limit: 10 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].activeUsersCount).toBe(3);
    expect(result.meta.totalItems).toBe(1);
  });
});

