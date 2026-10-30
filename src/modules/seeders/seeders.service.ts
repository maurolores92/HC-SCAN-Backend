import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Role } from '../role/role.model';
import { Users } from '../users/users.model';
import { Company, CompanyStatus } from '../companies/company.model';
import { Permission, CategoriaPermiso } from '../permissions/permission.model';
import { permissionsData } from './data/permissions.data';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(private sequelize: Sequelize) {}

  async onModuleInit() {
    try {
      // 1. Asegurar compañía matriz por defecto
      const defaultCompany = await this.ensureDefaultCompany();

      // 2. Asegurar roles canónicos del sistema
      await this.ensureSystemRoles();

      // 3. Asegurar catálogo de permisos
      await this.seedPermissions();

      // 4. Asegurar usuario Super Admin de la plataforma
      await this.ensureSuperAdminUser(defaultCompany?.id);
    } catch (err: any) {
      this.logger.error(`Error en inicialización de seeds: ${err?.message}`, err?.stack);
    }
  }

  async ensureDefaultCompany(): Promise<Company> {
    const [company, created] = await Company.findOrCreate({
      where: { slug: 'helpcopies' },
      defaults: {
        name: 'Helpcopies Matriz',
        slug: 'helpcopies',
        legalName: 'Helpcopies S.A.',
        taxId: '30-12345678-9',
        email: 'contacto@helpcopies.com',
        phone: '+54 11 4000-0000',
        address: 'Buenos Aires, Argentina',
        status: CompanyStatus.ACTIVE,
        settings: {
          maxPdfUploadSizeMb: 25,
          aiExtractionEnabled: true,
        },
      },
    });

    if (created) {
      this.logger.log(`[SeedService] Compañía matriz creada: ${company.name} (${company.slug})`);
    }

    return company;
  }

  async ensureSystemRoles() {
    const defaultRoles = [
      {
        name: 'Super Admin',
        slug: 'superadmin',
        color: '#F44336',
        companyId: null,
      },
      {
        name: 'Administrador de Compañía',
        slug: 'company_admin',
        color: '#2196F3',
        companyId: null,
      },
      {
        name: 'Operador de Documentos',
        slug: 'user',
        color: '#4CAF50',
        companyId: null,
      },
    ];

    for (const r of defaultRoles) {
      const [, created] = await Role.findOrCreate({
        where: { slug: r.slug, userId: null },
        defaults: { ...r, userId: null },
      });
      if (created) {
        this.logger.log(`[SeedService] Rol del sistema creado: ${r.name} (${r.slug})`);
      }
    }
  }

  async seedPermissions() {
    const transaction = await this.sequelize.transaction();
    try {
      let createdCount = 0;
      let updatedCount = 0;

      for (const p of permissionsData) {
        const [record, created] = await Permission.findOrCreate({
          where: { name: p.name },
          defaults: p,
          transaction,
        });

        if (created) {
          createdCount++;
        } else {
          await record.update(
            {
              categoria: p.categoria,
              displayName: p.displayName,
              description: p.description,
            },
            { transaction },
          );
          updatedCount++;
        }
      }

      const allPermissions = await Permission.findAll({ transaction });

      // Super Admin: todos los permisos
      const superAdminRole = await Role.findOne({
        where: { slug: 'superadmin' },
        transaction,
      });
      if (superAdminRole) {
        await superAdminRole.$set('permissions', allPermissions, { transaction });
      }

      // Company Admin: permisos de compañía, usuarios, roles, documentos, auditoría y notificaciones
      const companyAdminRole = await Role.findOne({
        where: { slug: 'company_admin' },
        transaction,
      });
      if (companyAdminRole) {
        const companyAdminPerms = allPermissions.filter((p: any) =>
          [
            'VIEW_DASHBOARD',
            'VIEW_COMPANIES',
            'UPDATE_COMPANY',
            'VIEW_USERS',
            'CREATE_USER',
            'UPDATE_USER',
            'DELETE_USER',
            'VIEW_ROLES',
            'CREATE_ROLE',
            'UPDATE_ROLE',
            'DELETE_ROLE',
            'VIEW_PERMISSIONS',
            'ASSIGN_PERMISSIONS',
            'VIEW_DOCUMENTS',
            'UPLOAD_DOCUMENT',
            'DELETE_DOCUMENT',
            'QUERY_AI_DOCUMENTS',
            'VIEW_AUDITS',
            'VIEW_NOTIFICATIONS',
            'MANAGE_NOTIFICATIONS',
          ].includes(p.name),
        );
        await companyAdminRole.$set('permissions', companyAdminPerms, { transaction });
      }

      // Operador de Documentos: visualización y trabajo con PDFs e IA
      const userRole = await Role.findOne({
        where: { slug: 'user' },
        transaction,
      });
      if (userRole) {
        const userPerms = allPermissions.filter((p: any) =>
          [
            'VIEW_DASHBOARD',
            'VIEW_DOCUMENTS',
            'UPLOAD_DOCUMENT',
            'QUERY_AI_DOCUMENTS',
            'VIEW_NOTIFICATIONS',
          ].includes(p.name),
        );
        await userRole.$set('permissions', userPerms, { transaction });
      }

      await transaction.commit();
      this.logger.log(
        `[SeedService] Permisos procesados (Nuevos: ${createdCount}, Actualizados: ${updatedCount})`,
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async ensureSuperAdminUser(defaultCompanyId?: number) {
    try {
      const superAdminRole = await Role.findOne({
        where: { slug: 'superadmin', userId: null },
      });
      if (!superAdminRole) {
        this.logger.warn('[SeedService] Rol superadmin no encontrado para vincular usuario.');
        return;
      }

      const existingSuperAdmin = await Users.findOne({
        where: {
          [Op.or]: [
            { email: 'superadmin@helpcopies.com' },
            { username: 'superadmin' },
          ],
        },
      });

      if (!existingSuperAdmin) {
        const hashedPassword = await Users.hashPassword('superadmin123');
        await Users.create({
          name: 'Super',
          lastName: 'Admin',
          email: 'superadmin@helpcopies.com',
          username: 'superadmin',
          phone: '+54 11 0000-0000',
          password: hashedPassword,
          roleId: superAdminRole.id,
          companyId: defaultCompanyId ?? null,
          isAdmin: true,
          status: 'ACTIVE',
        });
        this.logger.log(
          '[SeedService] Super Admin inicial creado: superadmin / superadmin@helpcopies.com (pass: superadmin123)',
        );
      } else {
        if (
          existingSuperAdmin.roleId !== superAdminRole.id ||
          !existingSuperAdmin.isAdmin
        ) {
          await existingSuperAdmin.update({
            roleId: superAdminRole.id,
            isAdmin: true,
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`[SeedService] Error asegurando usuario Super Admin: ${err?.message}`);
    }
  }

  async seedRoles() {
    await this.ensureSystemRoles();
    return { success: true, message: 'Roles creados exitosamente' };
  }

  async seedUsers() {
    const company = await this.ensureDefaultCompany();
    await this.ensureSuperAdminUser(company.id);
    return { success: true, message: 'Usuarios base creados exitosamente' };
  }

  async seedAll() {
    const company = await this.ensureDefaultCompany();
    await this.ensureSystemRoles();
    await this.seedPermissions();
    await this.ensureSuperAdminUser(company.id);

    return {
      success: true,
      message: 'Seeds de HC-SCAN ejecutados exitosamente',
    };
  }

  async seed() {
    return await this.seedAll();
  }
}
