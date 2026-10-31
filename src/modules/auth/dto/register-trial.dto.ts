import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterTrialDto {
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre y apellido son obligatorios' })
  @MaxLength(120, { message: 'El nombre no puede superar 120 caracteres' })
  fullName: string;

  @IsString({ message: 'El nombre de la empresa debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre o razón social de la empresa es obligatorio' })
  @MaxLength(150, { message: 'La empresa no puede superar 150 caracteres' })
  companyName: string;

  @IsEmail({}, { message: 'Debe ingresar un correo electrónico corporativo válido' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  @MaxLength(150, { message: 'El correo no puede superar 150 caracteres' })
  email: string;

  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El número de teléfono o WhatsApp es obligatorio para contactarte' })
  @MaxLength(50, { message: 'El teléfono no puede superar 50 caracteres' })
  phone: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  planId?: number;
}

