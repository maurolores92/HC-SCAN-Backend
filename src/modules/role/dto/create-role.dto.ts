import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  permissions?: number[];
}
