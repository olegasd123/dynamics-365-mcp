export type AuthType = "clientSecret" | "clientCertificate" | "deviceCode" | "interactiveBrowser";
export type ClientSecretSource = "inline" | "env" | "osKeychain";
export type PrivateKeySource = "file" | "osKeychain";
export type CertificateStore = "windowsCurrentUser" | "windowsLocalMachine";

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
  clientSecretSource?: ClientSecretSource;
  clientSecretName?: string;
  clientSecretEnv?: string;
  clientSecretKeychainService?: string;
  certificatePath?: string;
  certificateStore?: CertificateStore;
  certificateStoreThumbprint?: string;
  clientCertificateThumbprint?: string;
  privateKeySource?: PrivateKeySource;
  privateKeyName?: string;
  privateKeyKeychainService?: string;
  privateKeyPath?: string;
  privateKeyPassphrase?: string;
  redirectUri?: string;
}

export interface AppConfig {
  environments: EnvironmentConfig[];
  defaultEnvironment: string;
  advancedQueries?: AdvancedQueriesConfig;
}
