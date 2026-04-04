export type AuthType = "clientSecret" | "deviceCode";

export interface EnvironmentConfig {
  name: string;
  url: string;
  tenantId: string;
  authType?: AuthType;
  clientId?: string;
  clientSecret?: string;
}

export interface AppConfig {
  environments: EnvironmentConfig[];
  defaultEnvironment: string;
}
