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
import { Company } from '../../companies/company.model';

@Table({
  timestamps: true,
  tableName: 'company_monthly_usages',
  underscored: true,
  indexes: [
    {
      unique: true,
      name: 'uq_company_monthly_usages_company_period',
      fields: ['company_id', 'period'],
    },
  ],
})
export class CompanyMonthlyUsage extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => Company)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    field: 'company_id',
  })
  declare companyId: number;

  @BelongsTo(() => Company, { foreignKey: 'companyId', onDelete: 'CASCADE' })
  declare company: Company;

  /**
   * Período calendario en formato 'YYYY-MM' (ej: '2026-10').
   */
  @Column({
    type: DataType.STRING(7),
    allowNull: false,
  })
  declare period: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'ai_queries_count',
  })
  declare aiQueriesCount: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'ai_documents_processed',
  })
  declare aiDocumentsProcessed: number;

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'tokens_used',
  })
  declare tokensUsed: number;
}

