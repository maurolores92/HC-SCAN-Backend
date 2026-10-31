import { resolveDatabaseEnv } from './env-resolver';

export interface IDbConfig {
  host: any;
  port: number;
  database: any;
  username: any;
  password: any;
}

export interface IAppConfig {
  port: number;
  openRouterApiKey: string;
}

export const DBConfig = (): IDbConfig => resolveDatabaseEnv();

export const AppConfig = (): IAppConfig => ({
  port: Number(process.env.PORT) || 5000,
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
});
