import {
  AutoIncrement,
  BeforeCreate,
  BeforeUpdate,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
  HasMany,
  BelongsToMany,
} from 'sequelize-typescript';
import { Role } from '../role/role.model';
import { Company } from '../companies/company.model';
import { Permission } from '../permissions/permission.model';
import { UserPermission } from '../permissions/user-permission/user-permission.model';
import * as bcrypt from 'bcrypt';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export const UserStatusInfo = {
  [UserStatus.ACTIVE]: { value: UserStatus.ACTIVE, label: 'Activo', color: 'success' },
  [UserStatus.INACTIVE]: { value: UserStatus.INACTIVE, label: 'Inactivo', color: 'error' },
  [UserStatus.SUSPENDED]: { value: UserStatus.SUSPENDED, label: 'Suspendido', color: 'warning' },
};

@Table({ timestamps: true, tableName: 'users', underscored: true })
export class Users extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column
  declare id: number;

  @Column(DataType.STRING)
  declare name: string;

  @Column({ type: DataType.STRING, field: 'last_name' })
  declare lastName: string;

  @Column({ type: DataType.STRING, unique: true })
  declare email: string;

  @Column({ type: DataType.STRING, unique: false, allowNull: true })
  declare username: string;

  @Column(DataType.STRING)
  declare phone: string;

  @Column(DataType.STRING)
  declare password: string;

  @Column({ type: DataType.STRING, defaultValue: UserStatus.ACTIVE })
  declare status: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare image: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare document: string | null;

  @Column(DataType.VIRTUAL)
  get statusInfo() {
    return UserStatusInfo[this.getDataValue('status') as UserStatus] || UserStatusInfo[UserStatus.INACTIVE];
  }

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare isAdmin: boolean;

  /**
   * Multitenancy: Compañía a la que pertenece el usuario.
   * Nullable únicamente para el superadministrador global de la plataforma.
   */
  @ForeignKey(() => Company)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'company_id' })
  declare companyId: number | null;

  @BelongsTo(() => Company, { foreignKey: 'companyId', constraints: false })
  declare company: Company | null;

  @ForeignKey(() => Role)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'role_id' })
  declare roleId: number;

  @BelongsTo(() => Role, { foreignKey: 'roleId', constraints: false })
  declare role: Role;

  @Column({ type: DataType.INTEGER, allowNull: true, field: 'created_by_admin_id' })
  declare createdByAdminId: number;

  @HasMany(() => Role, { foreignKey: 'userId', as: 'customRoles', constraints: false })
  declare customRoles: Role[];

  @BelongsToMany(() => Permission, () => UserPermission)
  declare directPermissions: Permission[];

  @Column({ type: DataType.DATE, allowNull: true, field: 'last_login_at' })
  declare lastLoginAt: Date;

  @BeforeCreate
  @BeforeUpdate
  static async hashPasswordHook(instance: Users) {
    if (instance.changed('password')) {
      const isAlreadyHashed =
        instance.password.startsWith('$2a$') ||
        instance.password.startsWith('$2b$');
      if (!isAlreadyHashed) {
        instance.password = await bcrypt.hash(instance.password, 10);
      }
    }
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}
