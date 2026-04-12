# Run The MCP After Cloning From GitHub

This guide shows two ways to run the Dynamics 365 MCP server on a local machine after cloning the repository.

The server supports two transports:

- manual run with `stdio`
- script run as an HTTP service

Default transport is `stdio`.

## 1. Requirements

- Node.js 18 or newer
- npm
- Access to a Dynamics 365 / Dataverse environment
- One of these auth options:
  - `clientSecret` auth: tenant ID, client ID, client secret
  - `deviceCode` auth: tenant ID and browser sign-in access

## 2. Clone The Repository

```bash
git clone https://github.com/olegasd123/dynamics-365-mcp.git
cd dynamics-365-mcp
```

## 3. Install Dependencies

```bash
npm install
```

## 4. Build The Project

```bash
npm run build
```

This creates the MCP server entry file in `dist/index.js`.

## 5. Create The Config File

This config file should not go inside the repo root or the `dist` folder.

Keep it outside the project in a user folder, because it can contain secrets.

Examples:

- macOS: `/Users/your-name/.dynamics-365-mcp/config.json`
- Linux: `/home/your-name/.dynamics-365-mcp/config.json`
- Windows: `C:\Users\your-name\.dynamics-365-mcp\config.json`

Create this folder:

```bash
mkdir -p ~/.dynamics-365-mcp
```

Create this file:

`~/.dynamics-365-mcp/config.json`

On Windows, the same idea is:

`C:\Users\your-name\.dynamics-365-mcp\config.json`

### Option A: Client Secret Auth

Use this if you have an app registration with a client secret.

```json
{
  "environments": [
    {
      "name": "dev",
      "url": "https://your-org.crm.dynamics.com",
      "tenantId": "your-tenant-id",
      "authType": "clientSecret",
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret"
    }
  ],
  "defaultEnvironment": "dev"
}
```

### Option B: Interactive Device Code Auth

Use this if you do not have a client secret and can sign in with a user account.

```json
{
  "environments": [
    {
      "name": "dev",
      "url": "https://your-org.crm.dynamics.com",
      "tenantId": "your-tenant-id",
      "authType": "deviceCode"
    }
  ],
  "defaultEnvironment": "dev"
}
```

Optional:

- Add `clientId` if your team has its own public client app.
- If `clientId` is missing, the server uses a Microsoft public client ID.
- Device-code tokens are stored in the OS keychain.
- macOS uses Keychain Access, Linux uses Secret Service, and Windows uses Credential Manager.

## 6. Where To Get Tenant ID And Client ID

### Tenant ID

You can get the tenant ID in the Azure portal:

1. Open `Microsoft Entra ID`
2. Open `Overview`
3. Copy `Tenant ID`

### Client ID For Client Secret Auth

You can get the client ID from your app registration:

1. Open `Microsoft Entra ID`
2. Open `App registrations`
3. Open your app
4. Open `Overview`
5. Copy `Application (client) ID`

If you also need a client secret:

1. Open `Certificates & secrets`
2. Create a new client secret
3. Copy the secret value

### Client ID For Device Code Auth

For `deviceCode` auth you can:

- skip `clientId` and use the default public client ID from the server
- or use your own public client app

If you want your own public client app:

1. Open `Microsoft Entra ID`
2. Open `App registrations`
3. Create a new app registration
4. Copy `Application (client) ID`
5. In `Authentication`, enable public client / mobile and desktop flow if your tenant requires it

## 7. Run Option A: Manual Run With `stdio`

Use this when your MCP client starts the server itself with `command` and `args`.

Run:

```bash
npm start
```

Or run the built file directly:

```bash
node dist/index.js
```

The server uses `stdio`, so it waits for MCP client input. This is normal.

If you use `deviceCode` auth, the server prints sign-in instructions when a tool needs a token. Open the URL shown in the terminal, enter the code, and finish sign-in.

After the first sign-in, the server stores device-code tokens in the OS keychain when the auth response allows it. This means a restart often does not need a new browser sign-in.

Example MCP client config:

```json
{
  "mcpServers": {
    "dynamics-365": {
      "command": "node",
      "args": ["/absolute/path/to/dynamics-365-mcp/dist/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/dynamics-365-mcp` with your real local path.

## 8. Run Option B: Script Run As HTTP Service

Default mode is `stdio`. This is best when an MCP client starts the server itself.

If you want a long-running process on a fixed port, use HTTP mode:

- MCP endpoint: `/mcp`
- Health endpoint: `/health`
- Default host: `127.0.0.1`
- Default port: `3003`

The `/health` endpoint returns JSON with:

- service info like version, PID, uptime, host, port, and path
- config info like default environment and environment count
- request counters like total, active, and failed requests
- auth cache info from the token manager
- client cache info from the Dataverse client

The HTTP runtime reads these settings from CLI args or env vars:

- `MCP_TRANSPORT=http`
- `MCP_PORT`
- `MCP_HOST`
- `MCP_PATH`
- `MCP_SESSION_IDLE_TIMEOUT_MS`
- `MCP_MAX_ACTIVE_SESSIONS`
- `MCP_SESSION_CLEANUP_INTERVAL_MS`

The scripts auto-load the repo `.env` file if it exists. This is useful for:

- `D365_MCP_CONFIG`
- `MCP_TRANSPORT`
- `D365_MCP_LOG_ENABLED`
- `D365_MCP_LOG_DIR`
- `D365_MCP_LOG_MAX_BODY_CHARS`
- `D365_MCP_HOME`
- `D365_MCP_RUN_DIR`
- `D365_MCP_SERVICE_LOG_DIR`
- `MCP_PORT`
- `MCP_HOST`
- `MCP_PATH`
- `MCP_SESSION_IDLE_TIMEOUT_MS`
- `MCP_MAX_ACTIVE_SESSIONS`
- `MCP_SESSION_CLEANUP_INTERVAL_MS`
- `NODE_BIN`

Priority order:

- CLI arguments
- `.env`
- script defaults

Example `.env`:

```bash
D365_MCP_CONFIG=~/.dynamics-365-mcp/config.json
MCP_TRANSPORT=http
MCP_PORT=3003
MCP_HOST=127.0.0.1
MCP_PATH=/mcp
MCP_SESSION_IDLE_TIMEOUT_MS=900000
MCP_MAX_ACTIVE_SESSIONS=25
MCP_SESSION_CLEANUP_INTERVAL_MS=30000
D365_MCP_LOG_ENABLED=false
D365_MCP_LOG_DIR=~/.dynamics-365-mcp/logs
D365_MCP_LOG_MAX_BODY_CHARS=0
```

If request logs are enabled, the server writes one file per MCP tool call:

- folder: `~/.dynamics-365-mcp/logs/DDMMYYYY`
- file: `HHMMSSmmm-tool-name-...-req-<id>.txt`

Each file can include:

- tool input
- Dataverse request and response data
- formatted tool success or error response
- runtime errors seen during that tool call

### Run HTTP Mode Without Helper Scripts

Use this when you want the built server process itself to listen on HTTP.

With npm:

```bash
npm start -- --transport=http --port=3003 --host=127.0.0.1 --path=/mcp
```

With node:

```bash
node dist/index.js --transport=http --port=3003 --host=127.0.0.1 --path=/mcp
```

macOS / Linux:

```bash
./scripts/mcp-service.sh start 3003 ~/.dynamics-365-mcp/config.json
```

Windows:

```bat
scripts\mcp-service.bat start 3003 C:\Users\you\.dynamics-365-mcp\config.json
```

Stop:

```bash
./scripts/mcp-service.sh stop 3003
```

```bat
scripts\mcp-service.bat stop 3003
```

Restart:

```bash
./scripts/mcp-service.sh restart 3003 ~/.dynamics-365-mcp/config.json
```

```bat
scripts\mcp-service.bat restart 3003 C:\Users\you\.dynamics-365-mcp\config.json
```

If your MCP client supports HTTP MCP servers, use the MCP endpoint URL:

```json
{
  "mcpServers": {
    "dynamics-365": {
      "url": "http://127.0.0.1:3003/mcp"
    }
  }
}
```

If you use another port or path, update the URL to match your script settings.

## 9. Useful Commands

Format:

```bash
npm run format
```

Run lint:

```bash
npm run lint
```

Run tests:

```bash
npm test
```

Build:

```bash
npm run build
```

Run the transport smoke tests only:

```bash
npm run test:transport
```

Run the MCP contract tests only:

```bash
npm run test:contracts
```

Run in dev mode:

```bash
npm run dev
```

## 10. Common Problems

### `No Dynamics 365 configuration found`

Check that `~/.dynamics-365-mcp/config.json` exists and has valid JSON.

### Auth fails

- Check `tenantId`
- Check the environment `url`
- For `clientSecret` auth, check `clientId` and `clientSecret`
- For `deviceCode` auth, make sure the user account can access the Dataverse environment

### Build fails

Run:

```bash
npm install
npm run build
```

and check that your Node.js version is 18 or newer.
