import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Users } from '../../users/users.model';
import { Permission } from '../permission.model';

@Table({
  timestamps: false,
  tableName: 'user_permissions',
  underscored: true,
})
export class UserPermission extends Model {
  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER, primaryKey: true, field: 'user_id' })
  declare userId: number;

  @ForeignKey(() => Permission)
  @Column({ type: DataType.INTEGER, primaryKey: true, field: 'permission_id' })
  declare permissionId: number;
}
