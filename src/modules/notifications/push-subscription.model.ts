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

@Table({
  timestamps: true,
  tableName: 'push_subscriptions',
  underscored: true,
})
export class PushSubscription extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @BelongsTo(() => Users)
  declare user: Users;

  /** Endpoint único proporcionado por el servicio push del navegador (Google, Apple, Mozilla) */
  @Column({ type: DataType.TEXT, allowNull: false, unique: true })
  declare endpoint: string;

  /** Clave pública P-256 del cliente */
  @Column({ type: DataType.TEXT, allowNull: false })
  declare p256dh: string;

  /** Secreto de autenticación del cliente */
  @Column({ type: DataType.TEXT, allowNull: false })
  declare auth: string;

  /** Cadena User-Agent opcional para identificar el dispositivo o navegador */
  @Column({ type: DataType.STRING(255), allowNull: true })
  declare userAgent: string | null;

  @Column({ type: DataType.DATE })
  declare createdAt: Date;

  @Column({ type: DataType.DATE })
  declare updatedAt: Date;
}
