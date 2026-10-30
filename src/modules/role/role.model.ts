import {
  AutoIncrement,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
  BelongsTo,
  BelongsToMany,
  HasMany,
} from 'sequelize-typescript';
import { Users } from '../users/users.model';
import { Permission } from '../permissions/permission.model';
import { RolePermission } from '../permissions/role-permission/role-permission.model';
import { Company } from '../companies/company.model';

@Table({ timestamps: true, tableName: 'roles', underscored: true })
export class Role extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column(DataType.STRING)
  declare name: string;

  @Column(DataType.STRING)
  declare slug: string;

  @Column(DataType.STRING)
  declare color: string;

  /**
   * ID de la compañía a la que pertenece el rol.
   * Null indica un rol global de plataforma (ej: 'superadmin').
   */
  @ForeignKey(() => Company)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'company_id' })
  declare companyId: number | null;

  @BelongsTo(() => Company, { foreignKey: 'companyId', constraints: false })
  declare company: Company | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare userId: number;

  @BelongsTo(() => Users, { foreignKey: 'userId', constraints: false })
  declare user: Users;

  @BelongsToMany(() => Permission, () => RolePermission)
  declare permissions: Permission[];

  @HasMany(() => Users, { foreignKey: 'roleId', constraints: false })
  declare users: Users[];
}
