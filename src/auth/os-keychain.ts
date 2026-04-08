import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_KEYCHAIN_SERVICE = "dynamics-365-mcp";

export interface StoredDeviceCodeToken {
  environmentName: string;
  tenantId: string;
  url: string;
  clientId: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  refreshToken?: string;
  updatedAt: number;
}

export interface KeychainHealthSnapshot {
  storageType: "osKeychain";
  provider: string;
  serviceName: string;
  available: boolean;
  lastError?: string;
}

export interface DeviceCodeSecretStore {
  load(environmentName: string): Promise<StoredDeviceCodeToken | undefined>;
  save(token: StoredDeviceCodeToken): Promise<void>;
  delete(environmentName: string): Promise<void>;
  getHealthSnapshot(): KeychainHealthSnapshot;
}

interface CommandError extends Error {
  code?: number | string | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

class SecretNotFoundError extends Error {
  constructor() {
    super("Secret not found");
    this.name = "SecretNotFoundError";
  }
}

class UnsupportedSecretStore implements DeviceCodeSecretStore {
  getHealthSnapshot(): KeychainHealthSnapshot {
    return {
      storageType: "osKeychain",
      provider: `unsupported:${process.platform}`,
      serviceName: DEFAULT_KEYCHAIN_SERVICE,
      available: false,
      lastError: `OS keychain storage is not supported on ${process.platform}.`,
    };
  }

  async load(): Promise<StoredDeviceCodeToken | undefined> {
    return undefined;
  }

  async save(): Promise<void> {}

  async delete(): Promise<void> {}
}

export function createOsKeychainSecretStore(): DeviceCodeSecretStore {
  if (process.platform === "darwin") {
    return new OsKeychainSecretStore("macos-keychain", DEFAULT_KEYCHAIN_SERVICE);
  }

  if (process.platform === "linux") {
    return new OsKeychainSecretStore("linux-secret-service", DEFAULT_KEYCHAIN_SERVICE);
  }

  if (process.platform === "win32") {
    return new OsKeychainSecretStore("windows-credential-manager", DEFAULT_KEYCHAIN_SERVICE);
  }

  return new UnsupportedSecretStore();
}

class OsKeychainSecretStore implements DeviceCodeSecretStore {
  private available = true;
  private lastError?: string;

  constructor(
    private readonly provider: string,
    private readonly serviceName: string,
  ) {}

  getHealthSnapshot(): KeychainHealthSnapshot {
    return {
      storageType: "osKeychain",
      provider: this.provider,
      serviceName: this.serviceName,
      available: this.available,
      lastError: this.lastError,
    };
  }

  async load(environmentName: string): Promise<StoredDeviceCodeToken | undefined> {
    try {
      const secret = await this.readSecret(environmentName);
      this.clearError();
      return JSON.parse(secret) as StoredDeviceCodeToken;
    } catch (error) {
      if (error instanceof SecretNotFoundError) {
        return undefined;
      }

      this.recordError(error);
      return undefined;
    }
  }

  async save(token: StoredDeviceCodeToken): Promise<void> {
    try {
      await this.writeSecret(token.environmentName, JSON.stringify(token));
      this.clearError();
    } catch (error) {
      this.recordError(error);
    }
  }

  async delete(environmentName: string): Promise<void> {
    try {
      await this.deleteSecret(environmentName);
      this.clearError();
    } catch (error) {
      if (error instanceof SecretNotFoundError) {
        return;
      }

      this.recordError(error);
    }
  }

  private async readSecret(environmentName: string): Promise<string> {
    if (process.platform === "darwin") {
      const result = await execFileAsync("security", [
        "find-generic-password",
        "-a",
        environmentName,
        "-s",
        this.serviceName,
        "-w",
      ]);
      return result.stdout.toString().trimEnd();
    }

    if (process.platform === "linux") {
      try {
        const result = await execFileAsync("secret-tool", [
          "lookup",
          "service",
          this.serviceName,
          "account",
          environmentName,
        ]);
        return result.stdout.toString().trimEnd();
      } catch (error) {
        const commandError = error as CommandError;
        if (commandError.code === 1 && !String(commandError.stderr || "").trim()) {
          throw new SecretNotFoundError();
        }

        throw error;
      }
    }

    return this.runWindowsCredentialCommand("read", environmentName);
  }

  private async writeSecret(environmentName: string, secret: string): Promise<void> {
    if (process.platform === "darwin") {
      await execFileAsync("security", [
        "add-generic-password",
        "-U",
        "-a",
        environmentName,
        "-s",
        this.serviceName,
        "-w",
        secret,
      ]);
      return;
    }

    if (process.platform === "linux") {
      await runCommandWithInput(
        "secret-tool",
        [
          "store",
          `--label=Dynamics 365 MCP (${environmentName})`,
          "service",
          this.serviceName,
          "account",
          environmentName,
        ],
        secret,
      );
      return;
    }

    await this.runWindowsCredentialCommand("write", environmentName, secret);
  }

  private async deleteSecret(environmentName: string): Promise<void> {
    if (process.platform === "darwin") {
      await execFileAsync("security", [
        "delete-generic-password",
        "-a",
        environmentName,
        "-s",
        this.serviceName,
      ]);
      return;
    }

    if (process.platform === "linux") {
      try {
        await execFileAsync("secret-tool", [
          "clear",
          "service",
          this.serviceName,
          "account",
          environmentName,
        ]);
      } catch (error) {
        const commandError = error as CommandError;
        if (commandError.code === 1 && !String(commandError.stderr || "").trim()) {
          throw new SecretNotFoundError();
        }

        throw error;
      }
      return;
    }

    await this.runWindowsCredentialCommand("delete", environmentName);
  }

  private async runWindowsCredentialCommand(
    action: "read" | "write" | "delete",
    environmentName: string,
    secret?: string,
  ): Promise<string> {
    const encodedCommand = Buffer.from(WINDOWS_CREDENTIAL_SCRIPT, "utf16le").toString("base64");
    const result = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodedCommand,
      ],
      {
        env: {
          ...process.env,
          D365_MCP_KEYCHAIN_ACTION: action,
          D365_MCP_KEYCHAIN_ACCOUNT: environmentName,
          D365_MCP_KEYCHAIN_SECRET: secret,
          D365_MCP_KEYCHAIN_SERVICE: this.serviceName,
        },
      },
    );

    return result.stdout.toString().trimEnd();
  }

  private recordError(error: unknown): void {
    if (isSecretNotFoundError(error)) {
      return;
    }

    this.available = false;
    this.lastError = normalizeSecretStoreError(error);
  }

  private clearError(): void {
    this.available = true;
    this.lastError = undefined;
  }
}

function isSecretNotFoundError(error: unknown): boolean {
  if (error instanceof SecretNotFoundError) {
    return true;
  }

  const commandError = error as CommandError | undefined;
  const output = `${commandError?.stderr ?? ""}\n${commandError?.stdout ?? ""}`.toLowerCase();

  return (
    commandError?.code === 44 ||
    commandError?.code === 3 ||
    output.includes("could not be found") ||
    output.includes("secret not found") ||
    output.includes("element not found") ||
    output.includes("the system cannot find the file specified")
  );
}

function normalizeSecretStoreError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function runCommandWithInput(command: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const error = new Error(`Command failed with exit code ${code}: ${command}`) as CommandError;
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });

    child.stdin.end(input);
  });
}

const WINDOWS_CREDENTIAL_SCRIPT = `
Set-StrictMode -Version Latest

$signature = @"
using System;
using System.Runtime.InteropServices;

public static class D365CredentialManager {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags;
    public int Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize;
    public IntPtr CredentialBlob;
    public int Persist;
    public int AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);

  [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWrite([In] ref CREDENTIAL userCredential, int flags);

  [DllImport("Advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDelete(string target, int type, int flags);

  [DllImport("Advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]
  public static extern void CredFree(IntPtr credentialPtr);
}
"@

Add-Type -TypeDefinition $signature

$target = "$($env:D365_MCP_KEYCHAIN_SERVICE)/$($env:D365_MCP_KEYCHAIN_ACCOUNT)"
$action = $env:D365_MCP_KEYCHAIN_ACTION

if ($action -eq "read") {
  $credentialPtr = [IntPtr]::Zero
  if (-not [D365CredentialManager]::CredRead($target, 1, 0, [ref]$credentialPtr)) {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($errorCode -eq 1168) {
      Write-Error "Secret not found"
      exit 3
    }

    throw "CredRead failed with Win32 error $errorCode"
  }

  try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
      $credentialPtr,
      [type][D365CredentialManager+CREDENTIAL]
    )

    if ($credential.CredentialBlobSize -gt 0 -and $credential.CredentialBlob -ne [IntPtr]::Zero) {
      $charCount = [int]($credential.CredentialBlobSize / 2)
      $secret = [Runtime.InteropServices.Marshal]::PtrToStringUni(
        $credential.CredentialBlob,
        $charCount
      )
      [Console]::Out.Write($secret)
    }

    exit 0
  } finally {
    if ($credentialPtr -ne [IntPtr]::Zero) {
      [D365CredentialManager]::CredFree($credentialPtr)
    }
  }
}

if ($action -eq "write") {
  $secret = $env:D365_MCP_KEYCHAIN_SECRET
  $credentialBlob = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($secret)

  try {
    $credential = New-Object D365CredentialManager+CREDENTIAL
    $credential.Type = 1
    $credential.TargetName = $target
    $credential.CredentialBlobSize = [Text.Encoding]::Unicode.GetByteCount($secret)
    $credential.CredentialBlob = $credentialBlob
    $credential.Persist = 2
    $credential.UserName = $env:D365_MCP_KEYCHAIN_ACCOUNT

    if (-not [D365CredentialManager]::CredWrite([ref]$credential, 0)) {
      $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      throw "CredWrite failed with Win32 error $errorCode"
    }

    exit 0
  } finally {
    if ($credentialBlob -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeCoTaskMemUnicode($credentialBlob)
    }
  }
}

if ($action -eq "delete") {
  if (-not [D365CredentialManager]::CredDelete($target, 1, 0)) {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($errorCode -eq 1168) {
      exit 0
    }

    throw "CredDelete failed with Win32 error $errorCode"
  }

  exit 0
}

throw "Unsupported keychain action: $action"
`;
