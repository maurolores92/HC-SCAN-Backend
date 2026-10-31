import { resolveDatabaseEnv, resolveJwtSecret } from '../config/env-resolver';

export interface IDbConfig {
  host: any;
  port: number;
  database: any;
  username: any;
  password: any;
  jwtSecretKey: any;
}

export const DBConfig = (): IDbConfig => ({
  ...resolveDatabaseEnv(),
  jwtSecretKey: resolveJwtSecret(),
});
