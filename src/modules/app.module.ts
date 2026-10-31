import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';

import { DatabaseModule } from '../database/database.module';
import { DBConfig } from '../config/env.config';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RoleModule } from './role/role.module';
import { PermissionsModule } from './permissions/permissions.module';
import { SeedModule } from './seeders/seeders.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UploadsModule } from './uploads/uploads.module';
import { CompaniesModule } from './companies/companies.module';
import { PlansModule } from './plans/plans.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ConfigModule.forRoot({ load: [DBConfig] }),
    CacheModule.register({
      isGlobal: true,
    }),
    DatabaseModule,
    AuditModule,
    NotificationsModule,
    PermissionsModule,
    RoleModule,
    PlansModule,
    CompaniesModule,
    UsersModule,
    DocumentsModule,
    AuthModule,
    SeedModule,
    UploadsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Configuración de middlewares globales o tenant
  }
}
