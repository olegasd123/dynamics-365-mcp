export interface EnvironmentConfig {
  name: string;
  url: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface AppConfig {
  environments: EnvironmentConfig[];
  defaultEnvironment: string;
}
