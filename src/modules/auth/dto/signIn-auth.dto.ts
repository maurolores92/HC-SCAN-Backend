import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SignInAuthDto {
  @IsNotEmpty({ message: 'El usuario es obligatorio' })
  @IsString()
  username: string;

  @IsString({ message: 'La contraseña debe ser válida' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(20, { message: 'La contraseña no debe superar los 20 caracteres' })
  password: string;
}
