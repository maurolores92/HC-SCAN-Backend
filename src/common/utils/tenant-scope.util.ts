import { ForbiddenException } from '@nestjs/common';

/**
 * Determina de forma estricta si el usuario autenticado es el Super Administrador global de la plataforma.
 * Nunca considera `isAdmin: true` por sí solo, ya que los `company_admin` de cada empresa tienen `isAdmin: true`.
 */
export function isPlatformSuperAdmin(user: any): boolean {
  if (!user) return false;
  const roleSlug =
    typeof user.role === 'string'
      ? user.role.toLowerCase().trim()
      : String(user.role?.slug || '').toLowerCase().trim();
  const username = String(user.username || '').toLowerCase().trim();

  return roleSlug === 'superadmin' || username === 'superadmin';
}

/**
 * Exige que el usuario autenticado sea `superadmin`; en caso contrario lanza `ForbiddenException`.
 */
export function assertPlatformSuperAdmin(
  user: any,
  message = 'Acceso denegado: Acción reservada exclusivamente para el Super Administrador de la plataforma.',
): void {
  if (!isPlatformSuperAdmin(user)) {
    throw new ForbiddenException(message);
  }
}

/**
 * Extrae y valida obligatoriamente el `companyId` del usuario tenant autenticado.
 * Garantiza que ningún endpoint de tenant pueda ejecutarse sin filtro de compañía (`companyId`).
 */
export function requireTenantCompanyId(user: any): number {
  const companyId = Number(user?.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new ForbiddenException(
      'Acceso denegado: Su cuenta no posee una compañía asignada.',
    );
  }
  return companyId;
}

/**
 * Resuelve el `companyId` efectivo para consultas:
 * - Si es `superadmin`, permite vista global (`null`) o filtrar por `requestedCompanyId`.
 * - Si es usuario de compañía, ignora cualquier parámetro externo y fuerza siempre su propio `user.companyId`.
 */
export function resolveScopedCompanyId(
  user: any,
  requestedCompanyId?: number | string | null,
): number | null {
  if (isPlatformSuperAdmin(user)) {
    if (requestedCompanyId !== undefined && requestedCompanyId !== null && requestedCompanyId !== '') {
      const parsed = Number(requestedCompanyId);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
  }

  return requireTenantCompanyId(user);
}

