import { Injectable, NotFoundException } from '@nestjs/common';
import type { ModelStatic } from 'sequelize';
import { Model } from 'sequelize-typescript';

@Injectable()
export abstract class CrudService<T extends Model> {
  constructor(private readonly model: ModelStatic<T>) {}

  async create(data: any): Promise<T> {
    return this.model.create(data);
  }

  async findAll(): Promise<T[]> {
    return await this.model.findAll();
  }

  async findOne(id: number): Promise<T> {
    const record = (await this.model.findByPk(id)) as T;
    if (!record) {
      throw new NotFoundException(`Record with id ${id} not found`);
    }
    return record;
  }

  async update(id: number, data: Partial<T>): Promise<T> {
    const record = await this.findOne(id);
    await record.update(data);
    return record;
  }

  async delete(id: number): Promise<void> {
    const record = await this.findOne(id);
    await record.destroy();
  }
}
