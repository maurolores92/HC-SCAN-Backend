import {
  Controller,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  Get,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInAuthDto } from './dto/signIn-auth.dto';
import type { Request } from 'express';
import { Auth } from './decorators/auth.decorator';
import { Public } from './decorators/public.decorator';
import { RegisterDto } from '../users/dto/register.dto';

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

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  signUp(@Body() signUpDto: RegisterDto) {
    return this.authService.signUp(signUpDto);
  }
}
