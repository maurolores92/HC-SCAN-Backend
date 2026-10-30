import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    const secretOrKey = process.env.JWT_SECRET_KEY || 'hc_scan_jwt_secret_key_2026';
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey,
    });
  }

  async validate(data: JwtPayload): Promise<any> {
    try {
      const user = await this.usersService.findOneByEmail(data.email);
      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }
      return user;
    } catch (error) {
      throw new UnauthorizedException('Usuario no válido o sesión expirada');
    }
  }
}
