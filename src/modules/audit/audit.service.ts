import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  AuditLog,
  AuditAction,
  AuditActionLabel,
  buildAuditDescription,
} from './audit.model';
import { Users } from '../users/users.model';
import { Role } from '../role/role.model';
import { Company } from '../companies/company.model';
import { QueryAuditDto } from './dto/query-audit.dto';

export interface CreateAuditLogDto {
  companyId?: number;
  userId?: number;
  userName?: string;
  action: AuditAction;
  entity: string;
  entityId?: string | number;
  payload?: Record<string, any>;
  ipAddress?: string;
  description?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog) private readonly auditLogModel: typeof AuditLog,
  ) {}

  private sanitizePayload(payload: any): any {
    if (!payload) return payload;

    if (typeof payload === 'object' && !Array.isArray(payload)) {
      const sanitized = { ...payload };
      const sensitiveKeys = [
        'password',
        'token',
        'secret',
        'accessToken',
        'refreshToken',
      ];

      for (const key of Object.keys(sanitized)) {
        if (
          sensitiveKeys.some((sensitive) =>
            key.toLowerCase().includes(sensitive),
          )
        ) {
          sanitized[key] = '[ENCRIPTADO/OCULTO]';
        } else if (
          typeof sanitized[key] === 'object' &&
          sanitized[key] !== null
        ) {
          sanitized[key] = this.sanitizePayload(sanitized[key]);
        }
      }
      return sanitized;
    }

    if (Array.isArray(payload)) {
      return payload.map((item) => this.sanitizePayload(item));
    }

    return payload;
  }

  async log(data: CreateAuditLogDto): Promise<void> {
    try {
      const description = buildAuditDescription(
        data.action,
        data.entity,
        data.description,
      );
      const actionLabel = AuditActionLabel[data.action] ?? data.action;

      let finalUserName = data.userName;
      let finalCompanyId = data.companyId;

      if (data.userId && (!finalUserName || !finalCompanyId)) {
        const user = await Users.findByPk(data.userId);
        if (user) {
          if (!finalUserName) {
            finalUserName = `${user.name || ''} ${user.lastName || ''}`.trim();
          }
          if (!finalCompanyId && user.companyId) {
            finalCompanyId = user.companyId;
          }
        }
      }

      await this.auditLogModel.create({
        companyId: finalCompanyId ?? null,
        userId: data.userId ?? null,
        userName: finalUserName ?? null,
        action: data.action,
        actionLabel,
        description,
        entity: data.entity,
        entityId: data.entityId != null ? String(data.entityId) : null,
        payload: data.payload
          ? JSON.stringify(this.sanitizePayload(data.payload))
          : null,
        ipAddress: data.ipAddress ?? null,
      });
    } catch (error) {
      console.error('Failed to create audit log:', error);
    }
  }

  async findAll(query: QueryAuditDto) {
    const where: any = {};

    if (query.entity) {
      const entityMap: Record<string, string[]> = {
        User: ['User', 'users', 'user'],
        Role: ['Role', 'roles', 'role'],
        Company: ['Company', 'companies', 'company'],
        Document: ['Document', 'documents', 'document'],
        Permission: ['Permission', 'permissions', 'permission'],
        Notification: ['Notification', 'notifications', 'notification'],
      };

      if (entityMap[query.entity]) {
        where.entity = { [Op.in]: entityMap[query.entity] };
      } else {
        where.entity = query.entity;
      }
    }

    if (query.entityId) where.entityId = query.entityId;
    if (query.action) where.action = query.action;
    if (query.userId) where.userId = query.userId;
    if (query.companyId) where.companyId = query.companyId;

    if (query.search) {
      const search = query.search.trim();
      const isPostgres = this.auditLogModel.sequelize?.getDialect() === 'postgres';
      const likeOp = isPostgres ? Op.iLike : Op.like;
      const searchPattern = `%${search}%`;

      where[Op.or] = [
        { description: { [likeOp]: searchPattern } },
        { userName: { [likeOp]: searchPattern } },
        { actionLabel: { [likeOp]: searchPattern } },
        { entity: { [likeOp]: searchPattern } },
        { entityId: { [likeOp]: searchPattern } },
        { '$user.name$': { [likeOp]: searchPattern } },
        { '$user.email$': { [likeOp]: searchPattern } },
      ];
    }

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const { rows, count } = await this.auditLogModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      distinct: true,
      subQuery: false,
      include: [
        {
          model: Users,
          as: 'user',
          attributes: ['id', 'name', 'lastName', 'email', 'image'],
          required: false,
          include: [
            {
              model: Role,
              as: 'role',
              attributes: ['name'],
              required: false,
            },
          ],
        },
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name', 'slug'],
          required: false,
        },
      ],
    });

    return {
      data: rows,
      total: count,
      limit,
      offset,
    };
  }

  async findByEntity(entity: string, entityId: string, limit = 20) {
    return this.auditLogModel.findAll({
      where: {
        entity,
        entityId,
      },
      limit,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Users,
          as: 'user',
          attributes: ['id', 'name', 'lastName', 'email'],
          required: false,
        },
      ],
    });
  }
}
