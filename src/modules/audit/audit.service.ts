import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { literal, Op } from 'sequelize';
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
import {
  isPlatformSuperAdmin,
  requireTenantCompanyId,
} from '../../common/utils/tenant-scope.util';

export interface CreateAuditLogDto {
  companyId?: number | null;
  userId?: number;
  userName?: string;
  action: AuditAction;
  entity: string;
  entityId?: string | number;
  payload?: Record<string, any>;
  ipAddress?: string;
  description?: string;
}

const PLATFORM_ONLY_ENTITIES = [
  'Company',
  'companies',
  'company',
  'Plan',
  'plans',
  'plan',
  'Permission',
  'permissions',
  'permission',
];

const TENANT_PRIVATE_ENTITIES_FOR_SUPERADMIN = [
  'Document',
  'documents',
  'document',
  'Role',
  'roles',
  'role',
  'User',
  'users',
  'user',
];

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
      let finalCompanyId = data.companyId ?? null;
      const isGlobalEntity = ['plan', 'plans', 'permission', 'permissions'].includes(
        String(data.entity || '').toLowerCase(),
      );

      if (data.userId && (!finalUserName || finalCompanyId === null)) {
        const user = await Users.findByPk(data.userId, {
          include: [{ model: Role, as: 'role', attributes: ['slug'] }],
        });
        if (user) {
          if (!finalUserName) {
            finalUserName = `${user.name || ''} ${user.lastName || ''}`.trim();
          }
          const actorIsSuperAdmin =
            String(user.username || '').toLowerCase() === 'superadmin' ||
            user.role?.slug === 'superadmin';

          if (!actorIsSuperAdmin && finalCompanyId === null && user.companyId) {
            finalCompanyId = user.companyId;
          }
        }
      }

      if (isGlobalEntity) {
        finalCompanyId = null;
      }

      await this.auditLogModel.create({
        companyId: finalCompanyId,
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

  async findAll(query: QueryAuditDto, actorUser?: any) {
    const superAdmin = isPlatformSuperAdmin(actorUser);
    const andConditions: any[] = [];

    if (!superAdmin) {
      const tenantCompanyId = requireTenantCompanyId(actorUser);
      andConditions.push({ companyId: tenantCompanyId });
      andConditions.push({ entity: { [Op.notIn]: PLATFORM_ONLY_ENTITIES } });
      andConditions.push(
        literal(
          `("AuditLog"."user_id" IS NULL OR "AuditLog"."user_id" NOT IN (SELECT u."id" FROM "users" u LEFT JOIN "roles" r ON r."id" = u."role_id" WHERE LOWER(u."username") = 'superadmin' OR r."slug" = 'superadmin'))`,
        ),
      );
      andConditions.push(
        literal(
          `LOWER(COALESCE("AuditLog"."user_name", '')) NOT IN ('super admin', 'superadmin')`,
        ),
      );
    } else {
      // El Super Admin solo audita eventos de plataforma (Compañías, Planes, Permisos, Notificaciones y su propia sesión)
      andConditions.push({
        [Op.or]: [
          { entity: { [Op.notIn]: TENANT_PRIVATE_ENTITIES_FOR_SUPERADMIN } },
          ...(actorUser?.id ? [{ userId: Number(actorUser.id) }] : []),
        ],
      });
      if (query.companyId) {
        andConditions.push({ companyId: Number(query.companyId) });
      }
    }

    if (query.entity) {
      const entityMap: Record<string, string[]> = {
        User: ['User', 'users', 'user'],
        Role: ['Role', 'roles', 'role'],
        Company: ['Company', 'companies', 'company'],
        Plan: ['Plan', 'plans', 'plan'],
        Document: ['Document', 'documents', 'document'],
        Permission: ['Permission', 'permissions', 'permission'],
        Notification: ['Notification', 'notifications', 'notification'],
      };

      if (!superAdmin && ['Company', 'Plan', 'Permission'].includes(query.entity)) {
        return { data: [], total: 0, limit: query.limit ?? 50, offset: query.offset ?? 0 };
      }

      andConditions.push({
        entity: entityMap[query.entity]
          ? { [Op.in]: entityMap[query.entity] }
          : query.entity,
      });
    }

    if (query.entityId) andConditions.push({ entityId: query.entityId });
    if (query.action) andConditions.push({ action: query.action });
    if (query.userId) andConditions.push({ userId: Number(query.userId) });

    if (query.search && query.search.trim()) {
      const search = query.search.trim();
      const isPostgres = this.auditLogModel.sequelize?.getDialect() === 'postgres';
      const likeOp = isPostgres ? Op.iLike : Op.like;
      const searchPattern = `%${search}%`;

      andConditions.push({
        [Op.or]: [
          { description: { [likeOp]: searchPattern } },
          { userName: { [likeOp]: searchPattern } },
          { actionLabel: { [likeOp]: searchPattern } },
          { entity: { [likeOp]: searchPattern } },
          { entityId: { [likeOp]: searchPattern } },
          { '$user.name$': { [likeOp]: searchPattern } },
          { '$user.email$': { [likeOp]: searchPattern } },
        ],
      });
    }

    const where = andConditions.length > 0 ? { [Op.and]: andConditions } : {};
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
          attributes: ['id', 'name', 'lastName', 'email', 'image', 'companyId'],
          required: false,
          include: [
            {
              model: Role,
              as: 'role',
              attributes: ['name', 'slug'],
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

    return { data: rows, total: count, limit, offset };
  }

  async findByEntity(entity: string, entityId: string, actorUser?: any, limit = 20) {
    const superAdmin = isPlatformSuperAdmin(actorUser);
    const andConditions: any[] = [{ entity, entityId }];

    if (!superAdmin) {
      const tenantCompanyId = requireTenantCompanyId(actorUser);
      andConditions.push({ companyId: tenantCompanyId });
      andConditions.push({ entity: { [Op.notIn]: PLATFORM_ONLY_ENTITIES } });
      andConditions.push(
        literal(
          `("AuditLog"."user_id" IS NULL OR "AuditLog"."user_id" NOT IN (SELECT u."id" FROM "users" u LEFT JOIN "roles" r ON r."id" = u."role_id" WHERE LOWER(u."username") = 'superadmin' OR r."slug" = 'superadmin'))`,
        ),
      );
    }

    return this.auditLogModel.findAll({
      where: { [Op.and]: andConditions },
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
