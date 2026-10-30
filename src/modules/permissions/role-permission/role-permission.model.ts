import {
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Role } from '../../role/role.model';
import { Permission } from '../permission.model';

@Table({
  timestamps: true,
  tableName: 'role_permissions',
  underscored: true,
})
export class RolePermission extends Model {
  @ForeignKey(() => Role)
  @Column({ type: DataType.INTEGER })
  declare roleId: number;

  @ForeignKey(() => Permission)
  @Column({ type: DataType.INTEGER })
  declare permissionId: number;
}
