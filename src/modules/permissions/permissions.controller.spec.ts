import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { Permission } from './permission.model';

describe('PermissionsController & PermissionsService', () => {
  let controller: PermissionsController;
  let permissionModelMock: any;

  beforeEach(async () => {
    permissionModelMock = {
      findAll: jest.fn(),
      findByPk: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [
        PermissionsService,
        { provide: getModelToken(Permission), useValue: permissionModelMock },
      ],
    }).compile();

    controller = module.get<PermissionsController>(PermissionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe bloquear la modificación global de permisos a cualquier rol distinto de superadmin', () => {
    // Arrange
    const companyAdminUser = {
      id: 5,
      role: 'company_admin',
      isAdmin: true,
      companyId: 2,
    };

    // Act & Assert
    expect(() =>
      controller.updatePermissionRoles(
        1,
        { displayName: 'Editado', description: 'Desc', roleIds: [2] },
        companyAdminUser,
      ),
    ).toThrow(ForbiddenException);
  });

  it('debe bloquear GET /permissions a un operador común sin permisos de gestión de roles ni usuarios', () => {
    // Arrange
    const operatorUser = {
      id: 9,
      role: 'user',
      isAdmin: false,
      companyId: 2,
      permissions: ['VIEW_DASHBOARD', 'VIEW_DOCUMENTS'],
    };

    // Act & Assert
    expect(() => controller.findAll(operatorUser)).toThrow(ForbiddenException);
  });

  it('debe retornar únicamente permisos operativos del tenant cuando consulta un company_admin para configurar roles', async () => {
    // Arrange
    const tenantPerms = [
      { id: 1, name: 'VIEW_DASHBOARD', categoria: 'CORE' },
      { id: 2, name: 'VIEW_DOCUMENTS', categoria: 'DOCUMENTS' },
    ];
    permissionModelMock.findAll.mockResolvedValueOnce(tenantPerms);

    const companyAdminUser = {
      id: 5,
      role: 'company_admin',
      isAdmin: true,
      companyId: 2,
    };

    // Act
    const result = await controller.findAll(companyAdminUser);

    // Assert
    expect(result).toEqual(tenantPerms);
    expect(permissionModelMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ include: [] }),
    );
  });
});

