import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  IsBoolean,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  username: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsNumber()
  @IsOptional()
  roleId?: number;

  @IsNumber()
  @IsOptional()
  companyId?: number;

  @IsBoolean()
  @IsOptional()
  isAdmin?: boolean;

  @IsOptional()
  status?: string;

  @IsOptional()
  @IsString()
  image?: string | null;

  @IsOptional()
  @IsString()
  document?: string | null;
}
