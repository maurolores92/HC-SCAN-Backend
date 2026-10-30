import {
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';
import { Users } from '../../users/users.model';

@Table({
  timestamps: true,
  tableName: 'notification_preferences',
  underscored: false,
})
export class NotificationPreference extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => Users)
  @Column({ field: 'userId', type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @BelongsTo(() => Users)
  declare user: Users;

  /** Tipo de notificación, ej: 'system.user_created' */
  @Unique('user_type_unique')
  @Column({
    field: 'notificationType',
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare notificationType: string;

  /** Si la notificación debe mostrarse in-app */
  @Column({ field: 'inApp', type: DataType.BOOLEAN, defaultValue: true })
  declare inApp: boolean;

  @Column({ field: 'createdAt', type: DataType.DATE })
  declare createdAt: Date;

  @Column({ field: 'updatedAt', type: DataType.DATE })
  declare updatedAt: Date;
}
