import { Sequelize } from 'sequelize-typescript';
import { Company } from '../src/modules/companies/company.model';
import { Role } from '../src/modules/role/role.model';
import { Users } from '../src/modules/users/users.model';
import { Permission } from '../src/modules/permissions/permission.model';
import { UserPermission } from '../src/modules/permissions/user-permission/user-permission.model';
import { RolePermission } from '../src/modules/permissions/role-permission/role-permission.model';
import { Notification } from '../src/modules/notifications/notification.model';
import { NotificationPreference } from '../src/modules/notifications/models/notification-preference.model';
import { PushSubscription } from '../src/modules/notifications/push-subscription.model';
import { AuditLog } from '../src/modules/audit/audit.model';
import { Document } from '../src/modules/documents/document.model';

async function initPostgresSchema() {
  console.log('🔄 Conectando a PostgreSQL (hc_scan_db:5432)...');

  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'helpcopies_pass',
    database: process.env.DATABASE_NAME || 'hc_scan_db',
    logging: false,
    models: [
      Company,
      Role,
      Users,
      Permission,
      RolePermission,
      UserPermission,
      Notification,
      NotificationPreference,
      PushSubscription,
      AuditLog,
      Document,
    ],
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Conexión a PostgreSQL establecida con éxito.');

    console.log('🧹 Limpiando esquema public en PostgreSQL...');
    await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    console.log('🏗️ Creando todas las tablas limpias de HC-SCAN...');
    await sequelize.sync({ force: true });
    console.log('✅ Tablas creadas exitosamente.');

    const [tables]: any = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`\n🎉 Esquema HC-SCAN listo con ${tables.length} tablas:`);
    console.log(tables.map((t: any) => ` - ${t.table_name}`).join('\n'));

    await sequelize.close();
  } catch (error: any) {
    console.error('❌ Error inicializando esquema en PostgreSQL:', error);
    process.exit(1);
  }
}

initPostgresSchema();

