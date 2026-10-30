export interface IDbConfig {
  host: any;
  port: number;
  database: any;
  username: any;
  password: any;
  jwtSecretKey: any;
}

export const DBConfig = (): IDbConfig => ({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  jwtSecretKey: process.env.JWT_SECRET_KEY,
});
