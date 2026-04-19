export interface AuthTokenPayload {
  sub: string; // adminUser.id
  adminUserId: string;
  roles: string[];
  permissions: string[];
  iat?: number;
  exp?: number;
}

export interface LoginRequest {
  adminUserId: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  adminUser: {
    id: string;
    adminUserId: string;
    fullName: string;
    roles: string[];
  };
}

export interface MeResponse {
  id: string;
  adminUserId: string;
  fullName: string;
  email: string | null;
  roles: string[];
  permissions: string[];
}
