import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Users } from '../users/users.model';
import { Company } from '../companies/company.model';

export {
  NotificationCategory,
  NOTIFICATION_REGISTRY,
  NOTIFICATION_REGISTRY as NOTIFICATION_TYPES,
} from './constants/notification-registry';
export type {
  NotificationDefinition,
  RecipientTargetRule,
} from './constants/notification-registry';

@Table({
  timestamps: true,
  updatedAt: false,
  tableName: 'notifications',
  underscored: true,
})
export class Notification extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => Company)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'company_id' })
  declare companyId: number | null;

  @BelongsTo(() => Company, { foreignKey: 'companyId', constraints: false })
  declare company: Company | null;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'user_id' })
  declare userId: number;

  @BelongsTo(() => Users)
  declare user: Users;

  /** Tipo de notificación, ej: 'system.user_created', 'document.processed' */
  @Column({ type: DataType.STRING(100), allowNull: false })
  declare type: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare title: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare body: string;

  /** Payload adicional (ej: documentId, link, metadata) */
  @Column({
    type: DataType.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('data');
      if (!rawValue) return null;
      if (typeof rawValue === 'object') return rawValue;
      try {
        return JSON.parse(rawValue);
      } catch {
        return rawValue;
      }
    },
    set(value: any) {
      if (value === null || value === undefined) {
        this.setDataValue('data', null);
      } else if (typeof value === 'object') {
        this.setDataValue('data', JSON.stringify(value));
      } else {
        this.setDataValue('data', value);
      }
    },
  })
  declare data: Record<string, any> | null;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare read: boolean;

  @Column({ type: DataType.DATE, allowNull: true })
  declare readAt: Date | null;
}
