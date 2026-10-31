import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del plan es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'El slug del plan es obligatorio' })
  @MaxLength(100, { message: 'El slug no puede superar los 100 caracteres' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'El slug solo puede contener letras minúsculas, números y guiones',
  })
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'El precio mensual no puede ser negativo' })
  priceMonthly?: number;

  @IsOptional()
  @IsString()
  @IsIn(['ARS', 'USD'], { message: 'La moneda debe ser ARS o USD' })
  currency?: 'ARS' | 'USD';

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt({ message: 'La duración del período de prueba en días debe ser un entero' })
  @Min(1)
  trialDays?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt({ message: 'El límite de usuarios debe ser un número entero' })
  @Min(1, { message: 'El límite de usuarios debe ser al menos 1 o null (ilimitado)' })
  maxUsers?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt({ message: 'El límite de documentos debe ser un número entero' })
  @Min(1, { message: 'El límite de documentos debe ser al menos 1 o null (ilimitado)' })
  maxDocuments?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt({ message: 'El límite de almacenamiento (MB) debe ser un número entero' })
  @Min(1, { message: 'El límite de almacenamiento debe ser al menos 1 MB o null (ilimitado)' })
  maxStorageMb?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt({ message: 'El límite de consultas IA debe ser un número entero' })
  @Min(0, { message: 'El límite de consultas IA no puede ser negativo' })
  maxAiQueriesMonthly?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includedModules?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(30)
  badgeColor?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

