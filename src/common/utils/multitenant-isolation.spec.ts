import { ForbiddenException } from '@nestjs/common';
import { Op } from 'sequelize';
import {
  assertPlatformSuperAdmin,
  isPlatformSuperAdmin,
  requireTenantCompanyId,
  resolveScopedCompanyId,
} from './tenant-scope.util';
import { AuditService } from '../../modules/audit/audit.service';
import { NotificationRecipientsService } from '../../modules/notifications/services/notification-recipients.service';
import { Users } from '../../modules/users/users.model';
import { Role } from '../../modules/role/role.model';

describe('Aislamiento Multitenant y Separación SuperAdmin vs Compañías', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('tenant-scope.util', () => {
    it('debe identificar únicamente a superadmin y nunca a un company_admin con isAdmin=true', () => {
      // Arrange
      const superAdmin = { id: 1, username: 'superadmin', role: 'superadmin', isAdmin: true, companyId: null };
      const companyAdmin = { id: 2, username: 'admin_acme', role: 'company_admin', isAdmin: true, companyId: 10 };
      const orphanAdmin = { id: 3, username: 'orphan', role: 'company_admin', isAdmin: true, companyId: null };

      // Act & Assert
      expect(isPlatformSuperAdmin(superAdmin)).toBe(true);
      expect(isPlatformSuperAdmin(companyAdmin)).toBe(false);
      expect(isPlatformSuperAdmin(orphanAdmin)).toBe(false);
      expect(() => assertPlatformSuperAdmin(companyAdmin)).toThrow(ForbiddenException);
    });

    it('debe exigir companyId válido para usuarios de compañía e ignorar parámetros de otras empresas', () => {
      // Arrange
      const tenantUser = { id: 5, role: 'user', companyId: 22 };
      const userWithoutCompany = { id: 6, role: 'user', companyId: null };

      // Act & Assert
      expect(requireTenantCompanyId(tenantUser)).toBe(22);
      expect(resolveScopedCompanyId(tenantUser, 99)).toBe(22);
      expect(() => requireTenantCompanyId(userWithoutCompany)).toThrow(ForbiddenException);
    });
  });

  describe('AuditService.findAll — Aislamiento de Auditoría', () => {
    it('debe filtrar estrictamente por companyId del usuario y excluir movimientos de superadmin y entidades globales', async () => {
      // Arrange
      const findAndCountAllMock = jest.fn().mockResolvedValue({ rows: [], count: 0 });
      const auditModelMock: any = {
        findAndCountAll: findAndCountAllMock,
        sequelize: { getDialect: () => 'postgres' },
      };
      const auditService = new AuditService(auditModelMock);
      const companyAdmin = { id: 12, role: 'company_admin', isAdmin: true, companyId: 7 };

      // Act
      await auditService.findAll({ companyId: 999 } as any, companyAdmin);

      // Assert
      expect(findAndCountAllMock).toHaveBeenCalledTimes(1);
      const passedWhere = findAndCountAllMock.mock.calls[0][0].where;
      const andClauses = passedWhere[Op.and];
      expect(Array.isArray(andClauses)).toBe(true);
      expect(andClauses).toContainEqual({ companyId: 7 });
      expect(andClauses).not.toContainEqual({ companyId: 999 });
    });

    it('debe retornar lista vacía si un usuario de compañía intenta filtrar por entidad de plataforma (Plan, Company o Permission)', async () => {
      // Arrange
      const findAndCountAllMock = jest.fn();
      const auditService = new AuditService({ findAndCountAll: findAndCountAllMock } as any);
      const tenantUser = { id: 14, role: 'user', companyId: 7 };

      // Act
      const result = await auditService.findAll({ entity: 'Plan' } as any, tenantUser);

      // Assert
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(findAndCountAllMock).not.toHaveBeenCalled();
    });
  });

  describe('NotificationRecipientsService — Cero Fuga Cross-Tenant', () => {
    it('debe resolver destinatarios superadmin sin incluir a administradores de compañías (isAdmin=true)', async () => {
      // Arrange
      jest.spyOn(Role, 'findAll').mockResolvedValue([{ id: 1 }] as any);
      const usersFindAllSpy = jest
        .spyOn(Users, 'findAll')
        .mockResolvedValue([{ id: 1 }] as any);
      const service = new NotificationRecipientsService();

      // Act
      const recipients = await service.resolveRecipients(['superadmin'], {});

      // Assert
      expect(recipients).toEqual([1]);
      const queryWhere = JSON.stringify(usersFindAllSpy.mock.calls[0][0]?.where);
      expect(queryWhere).not.toContain('isAdmin');
    });

    it('no debe difundir notificaciones de company_admin si no se especifica companyId', async () => {
      // Arrange
      const usersFindAllSpy = jest.spyOn(Users, 'findAll');
      const service = new NotificationRecipientsService();

      // Act
      const recipients = await service.resolveRecipients(['company_admin'], {
        companyId: null,
      });

      // Assert
      expect(recipients).toEqual([]);
      expect(usersFindAllSpy).not.toHaveBeenCalled();
    });
  });
});
