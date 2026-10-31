import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { SyncService } from './sync.service';
import { SeedModule } from '../modules/seeders/seeders.module';
import { resolveDatabaseEnv } from '../config/env-resolver';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => {
        const db = resolveDatabaseEnv();
        return {
          dialect: (process.env.DB_DIALECT as any) || 'postgres',
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          autoLoadModels: true,
          define: {
            underscored: true,
            timestamps: true,
          },
          dialectOptions:
            process.env.DB_DIALECT === 'mssql'
              ? {
                  options: {
                    encrypt: true,
                    trustServerCertificate: true,
                  },
                }
              : {},
          synchronize: false,
        };
      },
    }),
    SeedModule,
  ],
  providers: [SyncService],
  exports: [SequelizeModule],
})
export class DatabaseModule {}
