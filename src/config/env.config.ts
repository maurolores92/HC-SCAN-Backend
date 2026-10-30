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

export const DBConfig = (): IDbConfig => ({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
});

export const AppConfig = (): IAppConfig => ({
  port: Number(process.env.PORT) || 5000,
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
});
