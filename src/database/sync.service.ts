import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { SeedService } from '../modules/seeders/seeders.service';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly seedService: SeedService,
  ) {}

  async onModuleInit() {
    const isForceSync = process.env.DB_FORCE_SYNC === 'true';
    const models = this.sequelize.models;

    // Orden explícito respetando Foreign Keys y aislamiento multitenant
    const syncOrder = [
      'Company',
      'Role',
      'Users',
      'Permission',
      'RolePermission',
      'UserPermission',
      'AuditLog',
      'Notification',
      'NotificationPreference',
      'PushSubscription',
      'Document',
    ];

    if (isForceSync) {
      this.logger.warn(
        'DB_FORCE_SYNC=true: Eliminando tablas para recrear esquemas limpios de HC-SCAN...',
      );

      const dropOrder = [...syncOrder].reverse();
      for (const modelName of dropOrder) {
        const model = models[modelName];
        if (model) {
          try {
            await model.drop({ cascade: true });
          } catch (e) {}
        }
      }
    }

    this.logger.log('Sincronizando modelos de HC-SCAN...');
    for (const modelName of syncOrder) {
      const model = models[modelName];
      if (model) {
        await model.sync();
      }
    }

    // Índices de alto rendimiento para multitenancy
    await this.ensureIndexes();

    // Verificación y ejecución de semillas
    let shouldSeed = isForceSync;
    if (!shouldSeed) {
      try {
        const superAdminExists = await this.sequelize.models.Users?.findOne({
          where: { username: 'superadmin' },
        });
        const permissionsCount = await this.sequelize.models.Permission?.count();
        if (!superAdminExists || (permissionsCount !== undefined && permissionsCount < 5)) {
          shouldSeed = true;
          this.logger.log('Base de datos sin inicializar: ejecutando semillas de HC-SCAN...');
        }
      } catch {
        shouldSeed = true;
      }
    }

    if (shouldSeed) {
      try {
        await this.seedService.seedAll();
        this.logger.log('Semillas de HC-SCAN ejecutadas exitosamente.');
      } catch (error: any) {
        this.logger.error('Error al ejecutar semillas iniciales:', error.message);
      }
    }

    this.logger.log('🚀 Base de datos HC-SCAN sincronizada y lista para operar.');
  }

  private async ensureIndexes() {
    const indexesToCreate = [
      { table: 'companies', name: 'idx_companies_slug', column: 'slug' },
      { table: 'users', name: 'idx_users_company_id', column: 'company_id' },
      { table: 'users', name: 'idx_users_email', column: 'email' },
      { table: 'roles', name: 'idx_roles_company_id', column: 'company_id' },
      { table: 'audits', name: 'idx_audits_company_id', column: 'company_id' },
      { table: 'audits', name: 'idx_audits_user_id', column: 'user_id' },
      { table: 'notifications', name: 'idx_notifications_company_id', column: 'company_id' },
      { table: 'notifications', name: 'idx_notifications_user_id', column: 'user_id' },
      { table: 'documents', name: 'idx_documents_company_id', column: 'company_id' },
      { table: 'documents', name: 'idx_documents_status', column: 'status' },
    ];

    for (const idx of indexesToCreate) {
      try {
        await this.sequelize.query(`
          CREATE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" ("${idx.column}");
        `);
      } catch (e: any) {}
    }
  }
}
