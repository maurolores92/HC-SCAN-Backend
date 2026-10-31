import { Injectable, Logger } from '@nestjs/common';
import { Op } from 'sequelize';
import { RecipientTargetRule } from '../constants/notification-registry';
import { Users } from '../../users/users.model';
import { Role } from '../../role/role.model';

@Injectable()
export class NotificationRecipientsService {
  private readonly logger = new Logger(NotificationRecipientsService.name);

  async resolveRecipients(
    rules: RecipientTargetRule[],
    context: {
      targetUserId?: number | null;
      excludeUserId?: number | null;
      companyId?: number | null;
    },
  ): Promise<number[]> {
    const recipientIds = new Set<number>();
    const likeOp = Op.iLike ? Op.iLike : Op.like;

    if (rules.includes('target_user') && context.targetUserId) {
      recipientIds.add(Number(context.targetUserId));
    }

    if (rules.includes('superadmin')) {
      try {
        const superAdminRoles = await Role.findAll({
          where: { slug: 'superadmin' },
          attributes: ['id'],
        });
        const superAdminRoleIds = superAdminRoles.map((r) => r.id);

        const superadmins = await Users.findAll({
          where: {
            [Op.and]: [
              {
                [Op.or]: [
                  { username: { [likeOp]: 'superadmin' } },
                  ...(superAdminRoleIds.length > 0
                    ? [{ roleId: { [Op.in]: superAdminRoleIds } }]
                    : []),
                ],
              },
              {
                [Op.or]: [
                  { status: { [likeOp]: 'active' } },
                  { status: null },
                ],
              },
            ],
          },
          attributes: ['id'],
        });
        for (const u of superadmins) {
          if (u.id) recipientIds.add(Number(u.id));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Error resolving superadmin users: ${msg}`);
      }
    }

    // Aislar estrictamente por companyId: jamás difundir a todas las compañías si falta companyId
    if (rules.includes('company_admin') && context.companyId) {
      try {
        const adminRoles = await Role.findAll({
          where: {
            slug: { [Op.in]: ['company_admin', 'admin'] },
          },
          attributes: ['id'],
        });
        const roleIds = adminRoles.map((r) => r.id);

        const admins = await Users.findAll({
          where: {
            companyId: context.companyId,
            username: { [Op.ne]: 'superadmin' },
            [Op.and]: [
              {
                [Op.or]: [
                  { isAdmin: true },
                  ...(roleIds.length > 0 ? [{ roleId: { [Op.in]: roleIds } }] : []),
                ],
              },
              {
                [Op.or]: [
                  { status: { [likeOp]: 'active' } },
                  { status: null },
                ],
              },
            ],
          },
          attributes: ['id'],
        });
        for (const a of admins) {
          if (a.id) recipientIds.add(Number(a.id));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Error resolving company_admin users: ${msg}`);
      }
    }

    if (rules.includes('company_users') && context.companyId) {
      try {
        const users = await Users.findAll({
          where: {
            companyId: context.companyId,
            username: { [Op.ne]: 'superadmin' },
            [Op.or]: [
              { status: { [likeOp]: 'active' } },
              { status: null },
            ],
          },
          attributes: ['id'],
        });
        for (const u of users) {
          if (u.id) recipientIds.add(Number(u.id));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Error resolving company users: ${msg}`);
      }
    }

    if (context.excludeUserId) {
      recipientIds.delete(Number(context.excludeUserId));
    }

    return Array.from(recipientIds).filter((id) => !isNaN(id) && id > 0);
  }

  async resolveUserIdsByRoleSlug(
    roleSlug: string,
    companyId?: number,
  ): Promise<number[]> {
    if (roleSlug !== 'superadmin' && !companyId) {
      return [];
    }

    const likeOp = Op.iLike ? Op.iLike : Op.like;
    const roles = await Role.findAll({
      where: { slug: roleSlug },
      attributes: ['id'],
    });

    const roleIds = roles.map((r) => r.id);
    if (roleIds.length === 0) return [];

    const whereUser: any = {
      roleId: { [Op.in]: roleIds },
      [Op.or]: [
        { status: { [likeOp]: 'active' } },
        { status: null },
      ],
    };
    if (companyId) {
      whereUser.companyId = companyId;
    }

    const users = await Users.findAll({
      where: whereUser,
      attributes: ['id'],
    });
    return users.map((u) => Number(u.id));
  }
}
