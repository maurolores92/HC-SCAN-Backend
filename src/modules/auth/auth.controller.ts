import {
  Controller,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  Get,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { SignInAuthDto } from './dto/signIn-auth.dto';
import { Auth } from './decorators/auth.decorator';
import { Public } from './decorators/public.decorator';
import { GetUser } from './decorators/get-user.decorator';
import { RegisterDto } from '../users/dto/register.dto';
import { RegisterTrialDto } from './dto/register-trial.dto';
import { assertPlatformSuperAdmin } from '../../common/utils/tenant-scope.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @Auth()
  async getMe(@Req() req: Request) {
    return await this.authService.me(req.headers.authorization);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async signIn(@Body() signInDto: SignInAuthDto) {
    return await this.authService.signIn(signInDto);
  }

  /**
   * Registro público de prueba gratuita de 6 días desde la web landing page.
   * Valida teléfono y correo obligatorios y crea tenant + admin con plan trial.
   */
  @Public()
  @Post('register-trial')
  @HttpCode(HttpStatus.CREATED)
  async registerTrial(@Body() dto: RegisterTrialDto) {
    return await this.authService.registerTrial(dto);
  }

  /**
   * Endpoint de compatibilidad pública para registro de prueba.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async publicRegister(@Body() dto: RegisterTrialDto) {
    return await this.authService.registerTrial(dto);
  }

  @Auth()
  @Post('admin/register')
  @HttpCode(HttpStatus.CREATED)
  signUp(@Body() signUpDto: RegisterDto, @GetUser() user: any) {
    assertPlatformSuperAdmin(
      user,
      'El alta directa de cuentas administrativas está reservada al Super Administrador.',
    );
    return this.authService.signUp(signUpDto);
  }
}
