import { existsSync, mkdirSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';

/**
 * Obtiene la ruta raíz del almacenamiento de archivos de la plataforma.
 * Se puede configurar mediante la variable de entorno STORAGE_ROOT_PATH.
 * Por defecto apunta a <root>/storage.
 */
export function getStorageRootPath(): string {
  const envPath = process.env.STORAGE_ROOT_PATH;
  const storagePath = envPath
    ? isAbsolute(envPath)
      ? envPath
      : resolve(process.cwd(), envPath)
    : resolve(process.cwd(), 'storage');

  if (!existsSync(storagePath)) {
    mkdirSync(storagePath, { recursive: true });
  }

  return storagePath;
}

/**
 * Obtiene la ruta física del directorio de almacenamiento para un tenant específico.
 * Estructura: storage/tenancy/<companyId>
 * Si no existe, se crea automáticamente.
 *
 * @param companyId Identificador numérico o slug del tenant
 * @returns Ruta absoluta al directorio de almacenamiento del tenant
 */
export function getTenantStoragePath(companyId: number | string): string {
  const tenantDir = join(getStorageRootPath(), 'tenancy', String(companyId));

  if (!existsSync(tenantDir)) {
    mkdirSync(tenantDir, { recursive: true });
  }

  return tenantDir;
}

