import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsBoolean, IsString } from 'class-validator';

export class PreferenceItemDto {
  @IsString()
  notificationType: string;

  @IsBoolean()
  inApp: boolean;
}

export class UpdatePreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  preferences: PreferenceItemDto[];
}
