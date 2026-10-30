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

    if (rules.includes('target_user') && context.targetUserId) {
      recipientIds.add(Number(context.targetUserId));
    }

    if (rules.includes('superadmin')) {
      try {
        const superadmins = await Users.findAll({
          where: {
            [Op.and]: [
              {
                [Op.or]: [
                  { isAdmin: true },
                  { username: { [Op.iLike ? Op.iLike : Op.like]: 'superadmin' } },
                ],
              },
              {
                [Op.or]: [
                  { status: { [Op.iLike ? Op.iLike : Op.like]: 'active' } },
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

    if (rules.includes('company_admin')) {
      try {
        const adminRoles = await Role.findAll({
          where: {
            [Op.or]: [
              { slug: 'company_admin' },
              { slug: 'admin' },
              { name: { [Op.iLike ? Op.iLike : Op.like]: '%admin%' } },
            ],
          },
          attributes: ['id'],
        });
        const roleIds = adminRoles.map((r) => r.id);
        if (roleIds.length > 0) {
          const whereUser: any = {
            roleId: { [Op.in]: roleIds },
            [Op.or]: [
              { status: { [Op.iLike ? Op.iLike : Op.like]: 'active' } },
              { status: null },
            ],
          };

          if (context.companyId) {
            whereUser.companyId = context.companyId;
          }

          const admins = await Users.findAll({
            where: whereUser,
            attributes: ['id'],
          });
          for (const a of admins) {
            if (a.id) recipientIds.add(Number(a.id));
          }
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
            [Op.or]: [
              { status: { [Op.iLike ? Op.iLike : Op.like]: 'active' } },
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
    const roles = await Role.findAll({
      where: {
        [Op.or]: [
          { slug: roleSlug },
          { name: { [Op.iLike ? Op.iLike : Op.like]: `%${roleSlug.replace(/_/g, ' ')}%` } },
        ],
      },
      attributes: ['id'],
    });

    const roleIds = roles.map((r) => r.id);
    const userIds = new Set<number>();

    if (roleIds.length > 0) {
      const whereUser: any = {
        roleId: { [Op.in]: roleIds },
        [Op.or]: [
          { status: { [Op.iLike ? Op.iLike : Op.like]: 'active' } },
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
      for (const u of users) {
        userIds.add(Number(u.id));
      }
    }

    return Array.from(userIds);
  }
}
