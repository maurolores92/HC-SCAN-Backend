import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class RegisterDto {
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  @IsString()
  lastName: string;

  @IsEmail({}, { message: 'El email no es válido' })
  email: string;

  @IsNotEmpty({ message: 'El nombre de usuario es obligatorio' })
  @IsString()
  username: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString({ message: 'La contraseña debe ser válida' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(20, { message: 'La contraseña no debe superar los 20 caracteres' })
  password: string;

  @IsOptional()
  @IsNumber()
  companyId?: number;
}
