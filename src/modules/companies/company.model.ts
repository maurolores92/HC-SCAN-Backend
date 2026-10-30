import {
  AutoIncrement,
  Column,
  DataType,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

export enum CompanyStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export const CompanyStatusInfo = {
  [CompanyStatus.ACTIVE]: { value: CompanyStatus.ACTIVE, label: 'Activa', color: 'success' },
  [CompanyStatus.INACTIVE]: { value: CompanyStatus.INACTIVE, label: 'Inactiva', color: 'error' },
  [CompanyStatus.SUSPENDED]: { value: CompanyStatus.SUSPENDED, label: 'Suspendida', color: 'warning' },
};

export const DEFAULT_ENABLED_MODULES = [
  'documents',
  'ai_queries',
  'users',
  'roles',
  'audit',
  'notifications',
];

@Table({
  timestamps: true,
  tableName: 'companies',
  underscored: true,
})
export class Company extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({
    type: DataType.STRING(150),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    unique: true,
  })
  declare slug: string;

  @Column({
    type: DataType.STRING(200),
    allowNull: true,
    field: 'legal_name',
  })
  declare legalName: string | null;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
    field: 'tax_id',
  })
  declare taxId: string | null;

  @Column({
    type: DataType.STRING(150),
    allowNull: true,
  })
  declare email: string | null;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  declare phone: string | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare address: string | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  declare logo: string | null;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: CompanyStatus.ACTIVE,
  })
  declare status: CompanyStatus;

  /**
   * Límite máximo de usuarios permitidos para esta empresa.
   */
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 10,
    field: 'max_users',
  })
  declare maxUsers: number;

  /**
   * Módulos habilitados específicamente para esta empresa.
   * Ej: ['documents', 'ai_queries', 'audit', 'notifications']
   */
  @Column({
    type: DataType.JSON,
    allowNull: false,
    defaultValue: DEFAULT_ENABLED_MODULES,
    field: 'enabled_modules',
  })
  declare enabledModules: string[];

  @Column({
    type: DataType.JSON,
    allowNull: true,
    defaultValue: {},
  })
  declare settings: Record<string, any> | null;

  @Column(DataType.VIRTUAL)
  get statusInfo() {
    return CompanyStatusInfo[this.getDataValue('status') as CompanyStatus] || CompanyStatusInfo[CompanyStatus.INACTIVE];
  }
}
