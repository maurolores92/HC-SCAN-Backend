/**
 * Resolución tolerante de variables de entorno.
 * Acepta ambas convenciones de nombres (`DATABASE_*` / `DB_*`, `JWT_SECRET_KEY` / `JWT_SECRET`)
 * para evitar que la conexión a PostgreSQL o la firma JWT reciban `undefined`.
 */
export const readEnv = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value.trim() !== '') {
      return value.trim();
    }
  }
  return undefined;
};

export interface ResolvedDatabaseEnv {
  host: string;
  port: number;
  username: string | undefined;
  password: string;
  database: string | undefined;
}

export const resolveDatabaseEnv = (): ResolvedDatabaseEnv => ({
  host: readEnv('DATABASE_HOST', 'DB_HOST') ?? 'localhost',
  port: Number(readEnv('DATABASE_PORT', 'DB_PORT') ?? 5432),
  username: readEnv('DATABASE_USER', 'DATABASE_USERNAME', 'DB_USERNAME', 'DB_USER'),
  // `pg` exige que la contraseña sea siempre string (SCRAM-SHA-256)
  password: readEnv('DATABASE_PASSWORD', 'DB_PASSWORD') ?? '',
  database: readEnv('DATABASE_NAME', 'DB_DATABASE', 'DB_NAME'),
});

export const resolveJwtSecret = (): string =>
  readEnv('JWT_SECRET_KEY', 'JWT_SECRET') ?? 'hc_scan_jwt_secret_key_2026';

