import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { SyncService } from './sync.service';
import { SeedModule } from '../modules/seeders/seeders.module';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        dialect: (process.env.DB_DIALECT as any) || 'postgres',
        host: configService.get<string>('DATABASE_HOST'),
        port: configService.get<number>('DATABASE_PORT'),
        username: configService.get<string>('DATABASE_USER'),
        password: configService.get<string>('DATABASE_PASSWORD'),
        database: configService.get<string>('DATABASE_NAME'),
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
      }),
    }),
    SeedModule,
  ],
  providers: [SyncService],
  exports: [SequelizeModule],
})
export class DatabaseModule {}
