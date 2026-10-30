import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyAdminCredentialsDto {
  @IsNotEmpty()
  @IsString()
  username: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}
