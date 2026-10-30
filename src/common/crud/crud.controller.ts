import {
  Body,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CrudService } from './crud.service';
import { Model } from 'sequelize-typescript';

export abstract class CrudController<T extends Model> {
  constructor(private readonly service: CrudService<T>) {}

  @Get('/')
  async getAll() {
    return this.service.findAll();
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post('')
  async create(@Body() body: any): Promise<any> {
    return this.service.create(body);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<T>,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<any> {
    await this.service.delete(Number(id));

    return { success: true };
  }
}
