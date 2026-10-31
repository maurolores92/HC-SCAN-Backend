import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CompanyStatus } from '../company.model';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la compañía es obligatorio' })
  @MaxLength(150, { message: 'El nombre no puede superar los 150 caracteres' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'El slug identificador es obligatorio' })
  @MaxLength(100, { message: 'El slug no puede superar los 100 caracteres' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'El slug solo puede contener letras minúsculas, números y guiones',
  })
  slug: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  legalName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  taxId?: string;

  @IsEmail({}, { message: 'Debe ingresar un email válido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  logo?: string;

  @IsEnum(CompanyStatus, {
    message: 'El estado debe ser ACTIVE, INACTIVE o SUSPENDED',
  })
  @IsOptional()
  status?: CompanyStatus;

  @IsOptional()
  @ValidateIf((_, val) => val !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  planId?: number | null;

  @IsOptional()
  @IsBoolean()
  useCustomLimits?: boolean;

  @IsOptional()
  @ValidateIf((_, val) => val !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El límite de usuarios debe ser al menos 1 o null (ilimitado)' })
  maxUsers?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El límite de documentos debe ser al menos 1 o null (ilimitado)' })
  maxDocuments?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El límite de almacenamiento debe ser al menos 1 MB o null (ilimitado)' })
  maxStorageMb?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'El límite de consultas IA no puede ser negativo' })
  maxAiQueriesMonthly?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @IsOptional()
  trialEndsAt?: Date | null;

  @IsOptional()
  settings?: Record<string, any>;

  // ==========================================
  // Datos opcionales para el Usuario Admin inicial
  // ==========================================
  @IsOptional()
  @IsString()
  adminName?: string;

  @IsOptional()
  @IsString()
  adminLastName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El email del administrador debe ser válido' })
  adminEmail?: string;

  @IsOptional()
  @IsString()
  adminUsername?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'La contraseña del administrador debe tener al menos 6 caracteres' })
  adminPassword?: string;
}
