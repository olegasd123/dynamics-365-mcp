export type AuthType = "clientSecret" | "deviceCode" | "interactiveBrowser";

export const DEFAULT_DYNAMICS_API_VERSION = "v9.2";

export interface AdvancedFetchXmlConfig {
  enabled?: boolean;
  allowedEnvironments?: string[];
  defaultLimit?: number;
  maxLimit?: number;
}

export interface AdvancedQueriesConfig {
  fetchXml?: AdvancedFetchXmlConfig;
}

export interface EnvironmentConfig {
  name: string;
  url: string;
  apiVersion?: string;
  tenantId: string;
  authType?: AuthType;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export interface AppConfig {
  environments: EnvironmentConfig[];
  defaultEnvironment: string;
  advancedQueries?: AdvancedQueriesConfig;
}
