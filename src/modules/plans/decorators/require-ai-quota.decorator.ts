import { SetMetadata } from '@nestjs/common';

export const REQUIRE_AI_QUOTA_KEY = 'require_ai_quota';

/**
 * Decorador para proteger endpoints futuros de consultas o procesamiento de IA,
 * validando automáticamente que el tenant disponga de cupo mensual de IA.
 */
export const RequireAiQuota = () => SetMetadata(REQUIRE_AI_QUOTA_KEY, true);

