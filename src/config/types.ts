export type AuthType = "clientSecret" | "deviceCode";

export const DEFAULT_DYNAMICS_API_VERSION = "v9.2";

export interface EnvironmentConfig {
  name: string;
  url: string;
  apiVersion?: string;
  tenantId: string;
  authType?: AuthType;
  clientId?: string;
  clientSecret?: string;
}

export interface AppConfig {
  environments: EnvironmentConfig[];
  defaultEnvironment: string;
}
