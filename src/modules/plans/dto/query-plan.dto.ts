import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class QueryPlanDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBooleanString()
  includeInactive?: string;
}

