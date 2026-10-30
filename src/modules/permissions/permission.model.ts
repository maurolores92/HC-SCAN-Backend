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
  COMPANIES = 'COMPANIES',
  USERS = 'USERS',
  ROLES = 'ROLES',
  PERMISSIONS = 'PERMISSIONS',
  DOCUMENTS = 'DOCUMENTS',
  AUDIT = 'AUDIT',
  NOTIFICATIONS = 'NOTIFICATIONS',
}

@Table({ timestamps: true, tableName: 'permissions', underscored: true })
export class Permission extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({ type: DataType.STRING, unique: true })
  declare name: string; // e.g. CREATE_USER

  @Column(DataType.STRING)
  declare displayName: string; // e.g. Crear usuarios

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
