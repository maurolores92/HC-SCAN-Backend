import {
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

export const DEFAULT_PLAN_MODULES = [
  'documents',
  'ai_queries',
  'users',
  'roles',
  'audit',
  'notifications',
];

@Table({
  timestamps: true,
  tableName: 'plans',
  underscored: true,
})
export class Plan extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({
    type: DataType.STRING(100),
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
    type: DataType.STRING(500),
    allowNull: true,
  })
  declare description: string | null;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'price_monthly',
  })
  declare priceMonthly: number;

  @Column({
    type: DataType.STRING(10),
    allowNull: false,
    defaultValue: 'ARS',
    field: 'currency',
  })
  declare currency: 'ARS' | 'USD';

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_trial',
  })
  declare isTrial: boolean;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    defaultValue: null,
    field: 'trial_days',
  })
  declare trialDays: number | null;

  /**
   * Límite máximo de usuarios activos (`null` = ilimitado).
   */
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    defaultValue: 10,
    field: 'max_users',
  })
  declare maxUsers: number | null;

  /**
   * Límite máximo de documentos PDF almacenados (`null` = ilimitado).
   */
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    defaultValue: 1000,
    field: 'max_documents',
  })
  declare maxDocuments: number | null;

  /**
   * Límite máximo de almacenamiento físico en MB (`null` = ilimitado).
   */
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    defaultValue: 5120,
    field: 'max_storage_mb',
  })
  declare maxStorageMb: number | null;

  /**
   * Límite mensual de consultas a la IA (`null` = ilimitado).
   */
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    defaultValue: 500,
    field: 'max_ai_queries_monthly',
  })
  declare maxAiQueriesMonthly: number | null;

  @Column({
    type: DataType.JSON,
    allowNull: false,
    defaultValue: DEFAULT_PLAN_MODULES,
    field: 'included_modules',
  })
  declare includedModules: string[];

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: 'primary',
    field: 'badge_color',
  })
  declare badgeColor: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_default',
  })
  declare isDefault: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active',
  })
  declare isActive: boolean;
}

