export interface JwtPayload {
  id: number;
  email: string;
  name: string;
  username?: string;
  companyId?: number | null;
  role?: string;
  iat?: number;
  exp?: number;
}
