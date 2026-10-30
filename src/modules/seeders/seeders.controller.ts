import { Controller, Post } from '@nestjs/common';
import { SeedService } from './seeders.service';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post()
  async executeSeed() {
    return await this.seedService.seed();
  }

  @Post('users')
  async seedUsers() {
    return await this.seedService.seedUsers();
  }

  @Post('roles')
  async seedRoles() {
    return await this.seedService.seedRoles();
  }

  @Post('permissions')
  async seedPermissions() {
    return await this.seedService.seedPermissions();
  }

  @Post('all')
  async seedAll() {
    return await this.seedService.seedAll();
  }
}
