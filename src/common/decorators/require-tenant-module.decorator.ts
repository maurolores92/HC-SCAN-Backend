import { SetMetadata } from '@nestjs/common';

export const TENANT_MODULE_KEY = 'tenant_module';

/**
 * Decorador para restringir endpoints al conjunto de módulos habilitados de la compañía del usuario.
 * @example @RequireTenantModule('documents')
 */
export const RequireTenantModule = (moduleName: string) =>
  SetMetadata(TENANT_MODULE_KEY, moduleName);

