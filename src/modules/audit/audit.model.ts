import {
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Users } from '../users/users.model';
import { Company } from '../companies/company.model';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  READ = 'READ',
  STATUS_CHANGE = 'STATUS_CHANGE',
  UPLOAD = 'UPLOAD',
  DOWNLOAD = 'DOWNLOAD',
  PROCESS_DOCUMENT = 'PROCESS_DOCUMENT',
  AI_QUERY = 'AI_QUERY',
}

export const AuditActionLabel: Record<AuditAction, string> = {
  [AuditAction.CREATE]: 'Crear',
  [AuditAction.UPDATE]: 'Actualizar',
  [AuditAction.DELETE]: 'Eliminar',
  [AuditAction.LOGIN]: 'Iniciar sesión',
  [AuditAction.LOGOUT]: 'Cerrar sesión',
  [AuditAction.READ]: 'Consultar',
  [AuditAction.STATUS_CHANGE]: 'Cambio de estado',
  [AuditAction.UPLOAD]: 'Subir archivo',
  [AuditAction.DOWNLOAD]: 'Descargar archivo',
  [AuditAction.PROCESS_DOCUMENT]: 'Procesar documento con IA',
  [AuditAction.AI_QUERY]: 'Consulta inteligente',
};

export const EntityLabel: Record<string, string> = {
  User: 'usuario',
  Role: 'rol',
  Company: 'compañía',
  Permission: 'permiso',
  Notification: 'notificación',
  NotificationPreference: 'preferencia de notificación',
  Document: 'documento',
  AuditLog: 'registro de auditoría',
};

export function buildAuditDescription(
  action: AuditAction,
  entity: string,
  customDescription?: string,
): string {
  if (customDescription) return customDescription;

  const entityLabel = EntityLabel[entity] ?? entity.toLowerCase();

  switch (action) {
    case AuditAction.CREATE:
      return `Se ha creado un ${entityLabel}`;
    case AuditAction.UPDATE:
      return `Se ha actualizado un ${entityLabel}`;
    case AuditAction.DELETE:
      return `Se ha eliminado un ${entityLabel}`;
    case AuditAction.LOGIN:
      return `Inicio de sesión`;
    case AuditAction.LOGOUT:
      return `Cierre de sesión`;
    case AuditAction.READ:
      return `Se ha consultado un ${entityLabel}`;
    case AuditAction.STATUS_CHANGE:
      return `Cambio de estado de ${entityLabel}`;
    case AuditAction.UPLOAD:
      return `Se ha subido un nuevo ${entityLabel}`;
    case AuditAction.DOWNLOAD:
      return `Se ha descargado un ${entityLabel}`;
    case AuditAction.PROCESS_DOCUMENT:
      return `Procesamiento inteligente de ${entityLabel}`;
    case AuditAction.AI_QUERY:
      return `Consulta IA realizada`;
    default:
      return `Acción sobre ${entityLabel}`;
  }
}

@Table({
  timestamps: true,
  updatedAt: false,
  tableName: 'audits',
  underscored: true,
})
export class AuditLog extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column(DataType.STRING)
  declare entity: string;

  @Column(DataType.STRING)
  declare entityId: string;

  @Column({ type: DataType.STRING(30), allowNull: false })
  declare action: AuditAction;

  @Column({ type: DataType.STRING(50), allowNull: true })
  declare actionLabel: string;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare description: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare payload: any;

  @Column({ type: DataType.STRING, allowNull: true })
  declare ipAddress: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare userName: string;

  @ForeignKey(() => Company)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'company_id' })
  declare companyId: number | null;

  @BelongsTo(() => Company, { foreignKey: 'companyId', constraints: false })
  declare company: Company | null;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'user_id' })
  declare userId: number;

  @BelongsTo(() => Users, { onDelete: 'NO ACTION', onUpdate: 'NO ACTION' })
  declare user: Users;
}
