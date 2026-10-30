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
import { Company } from '../companies/company.model';
import { Users } from '../users/users.model';

export enum DocumentSource {
  APP_UPLOAD = 'APP_UPLOAD',
  FTP = 'FTP',
}

export enum DocumentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  ERROR = 'ERROR',
}

export const DocumentStatusInfo = {
  [DocumentStatus.PENDING]: { value: DocumentStatus.PENDING, label: 'Pendiente de IA', color: 'warning' },
  [DocumentStatus.PROCESSING]: { value: DocumentStatus.PROCESSING, label: 'Procesando', color: 'info' },
  [DocumentStatus.PROCESSED]: { value: DocumentStatus.PROCESSED, label: 'Procesado', color: 'success' },
  [DocumentStatus.ERROR]: { value: DocumentStatus.ERROR, label: 'Error', color: 'error' },
};

@Table({
  timestamps: true,
  tableName: 'documents',
  underscored: true,
})
export class Document extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @ForeignKey(() => Company)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'company_id' })
  declare companyId: number;

  @BelongsTo(() => Company, { foreignKey: 'companyId' })
  declare company: Company;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'user_id' })
  declare userId: number | null;

  @BelongsTo(() => Users, { foreignKey: 'userId', constraints: false })
  declare user: Users | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    field: 'original_name',
  })
  declare originalName: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    field: 'file_name',
  })
  declare fileName: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
    field: 'file_path',
  })
  declare filePath: string;

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    field: 'file_size',
  })
  declare fileSize: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    defaultValue: 'application/pdf',
    field: 'mime_type',
  })
  declare mimeType: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: DocumentSource.APP_UPLOAD,
  })
  declare source: DocumentSource;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: DocumentStatus.PENDING,
  })
  declare status: DocumentStatus;

  @Column({
    type: DataType.STRING(64),
    allowNull: true,
    field: 'file_hash',
  })
  declare fileHash: string | null;

  @Column({
    type: DataType.JSON,
    allowNull: true,
    field: 'extracted_data',
  })
  declare extractedData: Record<string, any> | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: 'error_message',
  })
  declare errorMessage: string | null;

  @Column(DataType.VIRTUAL)
  get statusInfo() {
    return DocumentStatusInfo[this.getDataValue('status') as DocumentStatus] || DocumentStatusInfo[DocumentStatus.PENDING];
  }
}

