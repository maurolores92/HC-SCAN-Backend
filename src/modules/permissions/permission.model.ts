import {
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  BelongsToMany,
} from 'sequelize-typescript';
import { Role } from '../role/role.model';
import { Users } from '../users/users.model';
import { UserPermission } from './user-permission/user-permission.model';
import { RolePermission } from './role-permission/role-permission.model';

export enum CategoriaPermiso {
  CORE = 'CORE',
  USERS = 'USERS',
  ROLES = 'ROLES',
  DOCUMENTS = 'DOCUMENTS',
  AUDIT = 'AUDIT',
}

@Table({ timestamps: true, tableName: 'permissions', underscored: true })
export class Permission extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({ type: DataType.STRING, unique: true })
  declare name: string;

  @Column(DataType.STRING)
  declare displayName: string;

  @Column(DataType.STRING)
  declare description: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: CategoriaPermiso.CORE,
  })
  declare categoria: CategoriaPermiso;

  @BelongsToMany(() => Role, () => RolePermission)
  declare roles: Role[];

  @BelongsToMany(() => Users, () => UserPermission)
  declare users: Users[];
}
