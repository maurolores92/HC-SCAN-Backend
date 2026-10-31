import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Document } from './document.model';
import { Company } from '../companies/company.model';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentAiExtractorService } from './services/document-ai-extractor.service';
import { DocumentAiChatService } from './services/document-ai-chat.service';
import { DocumentProcessingQueueService } from './services/document-processing-queue.service';
import { TenantInboxWatcherService } from './services/tenant-inbox-watcher.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Document, Company]),
    AuditModule,
    NotificationsModule,
    PlansModule,
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentAiExtractorService,
    DocumentAiChatService,
    DocumentProcessingQueueService,
    TenantInboxWatcherService,
    DocumentsService,
  ],
  exports: [
    DocumentsService,
    DocumentAiChatService,
    TenantInboxWatcherService,
    DocumentProcessingQueueService,
    SequelizeModule,
  ],
})
export class DocumentsModule {}
