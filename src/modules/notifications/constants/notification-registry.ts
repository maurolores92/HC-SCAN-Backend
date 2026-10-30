/**
 * Catálogo Canónico de Notificaciones de HC-SCAN (Helpcopies Scan).
 * Fuente única de verdad para tipos, metadatos y destinatarios.
 */

export enum NotificationCategory {
  SYSTEM = 'system',
  SECURITY = 'security',
  COMPANIES = 'companies',
  DOCUMENTS = 'documents',
}

export type RecipientTargetRule =
  | 'superadmin'
  | 'company_admin'
  | 'target_user'
  | 'company_users';

export interface NotificationDefinition {
  key: string;
  category: NotificationCategory;
  label: string;
  description: string;
  icon: string;
  emoji: string;
  defaultInApp: boolean;
  defaultRecipients: RecipientTargetRule[];
}

export const NOTIFICATION_REGISTRY: Record<string, NotificationDefinition> = {
  // ── 1. Documentos y Procesamiento IA ──────────────────────
  'document.uploaded': {
    key: 'document.uploaded',
    category: NotificationCategory.DOCUMENTS,
    label: 'Documento subido',
    description: 'Cuando se carga un nuevo archivo PDF a la plataforma',
    icon: 'tabler:file-upload',
    emoji: '📄',
    defaultInApp: true,
    defaultRecipients: ['company_admin', 'target_user'],
  },
  'document.processed': {
    key: 'document.processed',
    category: NotificationCategory.DOCUMENTS,
    label: 'Documento procesado por IA',
    description: 'Cuando el pipeline de IA finaliza la extracción de datos del PDF',
    icon: 'tabler:sparkles',
    emoji: '✨',
    defaultInApp: true,
    defaultRecipients: ['company_admin', 'target_user'],
  },
  'document.error': {
    key: 'document.error',
    category: NotificationCategory.DOCUMENTS,
    label: 'Error en procesamiento de PDF',
    description: 'Cuando ocurre un fallo al extraer o procesar un documento',
    icon: 'tabler:alert-triangle',
    emoji: '⚠️',
    defaultInApp: true,
    defaultRecipients: ['company_admin', 'target_user'],
  },

  // ── 2. Compañías / Tenants ────────────────────────────────
  'system.company_created': {
    key: 'system.company_created',
    category: NotificationCategory.COMPANIES,
    label: 'Nueva compañía creada',
    description: 'Cuando se da de alta una nueva organización en HC-SCAN',
    icon: 'tabler:building',
    emoji: '🏢',
    defaultInApp: true,
    defaultRecipients: ['superadmin'],
  },
  'system.company_updated': {
    key: 'system.company_updated',
    category: NotificationCategory.COMPANIES,
    label: 'Compañía actualizada',
    description: 'Cuando se actualizan los datos de una compañía',
    icon: 'tabler:edit',
    emoji: '📝',
    defaultInApp: true,
    defaultRecipients: ['superadmin', 'company_admin'],
  },

  // ── 3. Usuarios y Seguridad ───────────────────────────────
  'system.user_created': {
    key: 'system.user_created',
    category: NotificationCategory.SYSTEM,
    label: 'Nuevo usuario registrado',
    description: 'Cuando se da de alta un nuevo usuario en la compañía',
    icon: 'tabler:user-plus',
    emoji: '👤',
    defaultInApp: true,
    defaultRecipients: ['company_admin', 'superadmin'],
  },
  'system.security_alert': {
    key: 'system.security_alert',
    category: NotificationCategory.SECURITY,
    label: 'Alerta de seguridad',
    description: 'Eventos críticos de seguridad, creación o cambios de roles y permisos',
    icon: 'tabler:shield-lock',
    emoji: '🚨',
    defaultInApp: true,
    defaultRecipients: ['superadmin', 'company_admin'],
  },
};
