import { BadRequestException } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { isAbsolute, join, resolve, sep } from 'path';

export interface TenantStorageDirectories {
  baseDir: string;
  inboxDir: string;
  vaultDir: string;
  quarantineDir: string;
}

/**
 * Obtiene la raíz del proyecto backend de forma canónica y determinista,
 * evitando que varíe según la carpeta desde donde se ejecutó el comando o proceso (process.cwd()).
 */
export function getBackendRootPath(): string {
  // En desarrollo (src/common/utils) o producción (dist/common/utils),
  // subiendo 3 niveles siempre se llega a la raíz de HC-SCAN-Backend.
  return resolve(__dirname, '..', '..', '..');
}

/**
 * Obtiene la ruta raíz del almacenamiento de archivos de la plataforma.
 * Configurable mediante `STORAGE_ROOT_PATH`; por defecto apunta a `HC-SCAN-Backend/storage`.
 */
export function getStorageRootPath(): string {
  const envPath = process.env.STORAGE_ROOT_PATH?.trim();
  const backendRoot = getBackendRootPath();

  const storagePath = envPath
    ? isAbsolute(envPath)
      ? resolve(envPath)
      : resolve(backendRoot, envPath)
    : resolve(backendRoot, 'storage');

  if (!existsSync(storagePath)) {
    mkdirSync(storagePath, { recursive: true });
  }

  return storagePath;
}

/**
 * Valida estrictamente el identificador numérico de la compañía para impedir Path Traversal.
 */
export function sanitizeTenantId(companyId: number | string): number {
  const parsed = Number(companyId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`Identificador de compañía inválido para storage: ${companyId}`);
  }
  return parsed;
}

/**
 * Aprovisiona de forma idempotente la estructura aislada de una compañía:
 * `storage/tenancy/company_<id>/{inbox,vault,quarantine}`
 */
export function ensureTenantDirectories(companyId: number | string): TenantStorageDirectories {
  const safeId = sanitizeTenantId(companyId);
  const tenancyRoot = join(getStorageRootPath(), 'tenancy');
  const baseDir = join(tenancyRoot, `company_${safeId}`);
  const inboxDir = join(baseDir, 'inbox');
  const vaultDir = join(baseDir, 'vault');
  const quarantineDir = join(baseDir, 'quarantine');

  for (const dir of [tenancyRoot, baseDir, inboxDir, vaultDir, quarantineDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  return { baseDir, inboxDir, vaultDir, quarantineDir };
}

/**
 * Retorna la carpeta raíz del tenant (`storage/tenancy/company_<id>`).
 */
export function getTenantStoragePath(companyId: number | string): string {
  return ensureTenantDirectories(companyId).baseDir;
}

/**
 * Retorna la bandeja de entrada (`inbox`) vigilada en vivo para SFTP / carga local en carpeta.
 */
export function getTenantInboxPath(companyId: number | string): string {
  return ensureTenantDirectories(companyId).inboxDir;
}

/**
 * Retorna la carpeta de cuarentena (`quarantine`) para archivos inválidos, duplicados o sin cupo.
 */
export function getTenantQuarantinePath(companyId: number | string): string {
  return ensureTenantDirectories(companyId).quarantineDir;
}

/**
 * Prepara la carpeta mensual dentro de la bóveda (`vault/YYYY/MM`) y retorna ruta absoluta y relativa.
 */
export function getTenantVaultMonthlyPath(
  companyId: number | string,
  refDate: Date = new Date(),
): { absoluteDir: string; relativeDir: string } {
  const safeId = sanitizeTenantId(companyId);
  const { vaultDir } = ensureTenantDirectories(safeId);
  const year = String(refDate.getUTCFullYear());
  const month = String(refDate.getUTCMonth() + 1).padStart(2, '0');
  const absoluteDir = join(vaultDir, year, month);

  if (!existsSync(absoluteDir)) {
    mkdirSync(absoluteDir, { recursive: true });
  }

  const relativeDir = `tenancy/company_${safeId}/vault/${year}/${month}`;
  return { absoluteDir, relativeDir };
}

/**
 * Resuelve de forma segura la ruta física de un documento verificando que jamás salga de `STORAGE_ROOT_PATH`.
 * Mantiene compatibilidad hacia atrás con registros previos (`tenancy/<id>/<fileName>`).
 */
export function resolveSafeStorageFilePath(
  relativePath: string,
  fallbackCompanyId?: number,
  fallbackFileName?: string,
): string {
  const root = getStorageRootPath();
  const normalizedRel = (relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const primaryCandidate = resolve(root, normalizedRel);

  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!primaryCandidate.startsWith(rootPrefix)) {
    throw new BadRequestException('Ruta de almacenamiento fuera de los límites permitidos');
  }

  if (existsSync(primaryCandidate)) {
    return primaryCandidate;
  }

  // Fallback de compatibilidad para rutas antiguas `storage/tenancy/<id>/<fileName>`
  if (fallbackCompanyId && fallbackFileName) {
    const safeId = sanitizeTenantId(fallbackCompanyId);
    const legacyPath = resolve(root, 'tenancy', String(safeId), fallbackFileName);
    if (legacyPath.startsWith(rootPrefix) && existsSync(legacyPath)) {
      return legacyPath;
    }
  }

  return primaryCandidate;
}
