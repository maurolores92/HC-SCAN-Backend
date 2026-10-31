import { Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SeedService } from './seeders.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { assertPlatformSuperAdmin } from '../../common/utils/tenant-scope.util';

@Controller('seed')
@UseGuards(AuthGuard('jwt'))
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post()
  async executeSeed(@GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.seedService.seed();
  }

  @Post('users')
  async seedUsers(@GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.seedService.seedUsers();
  }

  @Post('roles')
  async seedRoles(@GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.seedService.seedRoles();
  }

  @Post('permissions')
  async seedPermissions(@GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.seedService.seedPermissions();
  }

  @Post('all')
  async seedAll(@GetUser() user: any) {
    assertPlatformSuperAdmin(user);
    return this.seedService.seedAll();
  }
}
