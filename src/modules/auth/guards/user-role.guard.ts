import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

@Injectable()
export class UserRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const validRoles = this.reflector.get<string[]>(
      'roles',
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!validRoles || validRoles.length === 0) {
      return true;
    }

    if (user?.isAdmin && validRoles.includes('admin')) {
      return true;
    }

    const userRole = user?.role;
    if (userRole && validRoles.includes(userRole)) {
      return true;
    }

    return false;
  }
}
