import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { SeedService } from '../modules/seeders/seeders.service';
import { ensureTenantDirectories } from '../common/utils/storage-path.util';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly seedService: SeedService,
  ) { }

  async onModuleInit() {
    const isForceSync = process.env.DB_FORCE_SYNC === 'true';
    const models = this.sequelize.models;

    const syncOrder = [
      'Plan',
      'Company',
      'CompanyMonthlyUsage',
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
      for (const modelName of [...syncOrder].reverse()) {
        const model = models[modelName];
        if (model) {
          try {
            await model.drop({ cascade: true });
          } catch { }
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

    await this.ensurePlanSchemaColumns();
    await this.ensureDocumentSchemaColumns();
    await this.ensureIndexes();

    try {
      await this.seedService.seedAll();
      this.logger.log('Semillas de HC-SCAN sincronizadas exitosamente.');
    } catch (error: any) {
      this.logger.error('Error al ejecutar semillas iniciales:', error.message);
    }

    await this.sanitizeMultitenantDataIsolation();
    await this.provisionTenantStorageDirectories();

    this.logger.log('🚀 Base de datos HC-SCAN sincronizada y lista para operar.');
  }

  private async ensurePlanSchemaColumns() {
    const statements = [
      `ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) DEFAULT 'ARS';`,
      `ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "is_trial" BOOLEAN NOT NULL DEFAULT FALSE;`,
      `ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "trial_days" INTEGER DEFAULT NULL;`,
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "plan_id" INTEGER REFERENCES "plans"("id") ON DELETE SET NULL;`,
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "is_trial" BOOLEAN NOT NULL DEFAULT FALSE;`,
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL;`,
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "use_custom_limits" BOOLEAN NOT NULL DEFAULT FALSE;`,
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "max_documents" INTEGER DEFAULT NULL;`,
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "max_storage_mb" INTEGER DEFAULT NULL;`,
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "max_ai_queries_monthly" INTEGER DEFAULT NULL;`,
      `ALTER TABLE "companies" ALTER COLUMN "max_users" DROP NOT NULL;`,
    ];

    for (const sql of statements) {
      try {
        await this.sequelize.query(sql);
      } catch { }
    }
  }

  private async ensureDocumentSchemaColumns() {
    const statements = [
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "document_type" VARCHAR(80) DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "summary" TEXT DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "document_number" VARCHAR(120) DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "document_date" DATE DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "issuer_name" VARCHAR(220) DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "issuer_tax_id" VARCHAR(50) DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "recipient_name" VARCHAR(220) DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "responsible_person" VARCHAR(180) DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "total_amount" DECIMAL(15, 2) DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "tags" JSONB DEFAULT '[]'::jsonb;`,
      `ALTER TABLE "documents" ALTER COLUMN "extracted_data" TYPE JSONB USING "extracted_data"::jsonb;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "raw_text" TEXT DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "page_count" INTEGER DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "ai_confidence" REAL DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "extraction_engine" VARCHAR(40) DEFAULT NULL;`,
      `ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL;`,
    ];

    for (const sql of statements) {
      try {
        await this.sequelize.query(sql);
      } catch { }
    }
  }

  private async ensureIndexes() {
    const singleColumnIndexes = [
      { table: 'plans', name: 'idx_plans_slug', column: 'slug' },
      { table: 'companies', name: 'idx_companies_slug', column: 'slug' },
      { table: 'companies', name: 'idx_companies_plan_id', column: 'plan_id' },
      { table: 'company_monthly_usages', name: 'idx_company_monthly_usages_company_id', column: 'company_id' },
      { table: 'users', name: 'idx_users_company_id', column: 'company_id' },
      { table: 'users', name: 'idx_users_email', column: 'email' },
      { table: 'roles', name: 'idx_roles_company_id', column: 'company_id' },
      { table: 'audits', name: 'idx_audits_company_id', column: 'company_id' },
      { table: 'audits', name: 'idx_audits_user_id', column: 'user_id' },
      { table: 'notifications', name: 'idx_notifications_company_id', column: 'company_id' },
      { table: 'notifications', name: 'idx_notifications_user_id', column: 'user_id' },
      { table: 'documents', name: 'idx_documents_company_id', column: 'company_id' },
      { table: 'documents', name: 'idx_documents_status', column: 'status' },
      { table: 'documents', name: 'idx_documents_file_hash', column: 'file_hash' },
    ];

    for (const idx of singleColumnIndexes) {
      try {
        await this.sequelize.query(
          `CREATE INDEX IF NOT EXISTS "${idx.name}" ON "${idx.table}" ("${idx.column}");`,
        );
      } catch { }
    }

    const advancedDocumentIndexes = [
      `CREATE INDEX IF NOT EXISTS "idx_documents_company_type" ON "documents" ("company_id", "document_type");`,
      `CREATE INDEX IF NOT EXISTS "idx_documents_company_date" ON "documents" ("company_id", "document_date");`,
      `CREATE INDEX IF NOT EXISTS "idx_documents_extracted_data_gin" ON "documents" USING GIN ("extracted_data");`,
      `CREATE INDEX IF NOT EXISTS "idx_documents_fts_spanish" ON "documents" USING GIN (to_tsvector('spanish', coalesce("raw_text", '') || ' ' || coalesce("summary", '')));`,
    ];

    for (const sql of advancedDocumentIndexes) {
      try {
        await this.sequelize.query(sql);
      } catch { }
    }
  }

  private async sanitizeMultitenantDataIsolation() {
    const cleanupQueries = [
      // El Super Admin global nunca debe pertenecer a una compañía tenant específica
      `UPDATE "users" SET "company_id" = NULL WHERE LOWER("username") = 'superadmin' OR "role_id" IN (SELECT "id" FROM "roles" WHERE "slug" = 'superadmin');`,
      // Limpiar company_id residual en auditorías de entidades globales de plataforma
      `UPDATE "audits" SET "company_id" = NULL WHERE LOWER("entity") IN ('plan', 'plans', 'permission', 'permissions');`,
      // Purgar cualquier notificación cruzada recibida por usuarios de otra compañía
      `DELETE FROM "notifications" n USING "users" u WHERE n."user_id" = u."id" AND u."company_id" IS NOT NULL AND n."company_id" IS NOT NULL AND n."company_id" <> u."company_id";`,
      `DELETE FROM "notifications" n USING "users" u WHERE n."user_id" = u."id" AND u."company_id" IS NOT NULL AND n."type" = 'system.company_created';`,
    ];

    for (const sql of cleanupQueries) {
      try {
        await this.sequelize.query(sql);
      } catch { }
    }
  }

  private async provisionTenantStorageDirectories() {
    try {
      const companyModel = this.sequelize.models['Company'];
      if (!companyModel) return;
      const companies = await companyModel.findAll({ attributes: ['id'], raw: true });
      for (const comp of companies as unknown as Array<{ id: number }>) {
        ensureTenantDirectories(comp.id);
      }
      this.logger.log(
        `📁 Directorios storage/tenancy/company_<id>/{inbox,vault,quarantine} listos para ${companies.length} compañía(s).`,
      );
    } catch (error: any) {
      this.logger.warn(`No se pudieron aprovisionar directorios de storage: ${error?.message}`);
    }
  }
}
