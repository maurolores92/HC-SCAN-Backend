import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindAllQuerysDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumberString()
  roleId?: number;

  @IsOptional()
  @IsNumberString()
  companyId?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
