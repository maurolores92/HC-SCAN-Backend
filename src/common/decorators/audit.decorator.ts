import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '../../modules/audit/audit.model';

export const AUDIT_KEY = 'audit';
export interface AuditMeta {
  action: AuditAction;
  entity: string;
}

export const Audit = (action: AuditAction, entity: string) =>
  SetMetadata(AUDIT_KEY, { action, entity });
