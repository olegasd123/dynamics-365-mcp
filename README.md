# Dynamics 365 CRM MCP Server

An MCP (Model Context Protocol) server that exposes Microsoft Dynamics 365 CRM metadata through conversational tools. Supports querying plugins, workflows, actions, web resources, and comparing configurations across multiple environments (dev, test, pre-prod, prod, etc.).

## Tech Stack

- **Runtime**: Node.js 18+ (ESM)
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Transport**: stdio
- **Auth**: Azure AD OAuth2 — client secret or interactive device code
- **Package manager**: npm

## Architecture

```
src/
  index.ts                          # Entry point: McpServer + StdioServerTransport
  config/
    types.ts                        # Environment config interfaces
    environments.ts                 # Config loader (JSON file, connection string envs)
  auth/
    token-manager.ts                # OAuth2 token flows + per-env token cache
  client/
    dynamics-client.ts              # Dataverse Web API HTTP client (auth, retry, pagination)
  tools/
    index.ts                        # Tool registration barrel
    plugins/
      list-plugins.ts
      list-plugin-steps.ts
      list-plugin-images.ts
      get-plugin-details.ts
    workflows/
      list-workflows.ts
      list-actions.ts
      get-workflow-details.ts
    web-resources/
      list-web-resources.ts
      get-web-resource-content.ts
    comparison/
      compare-plugins.ts
      compare-workflows.ts
      compare-web-resources.ts
      compare-environment-matrix.ts
  queries/
    plugin-queries.ts               # OData query builders for plugin entities
    workflow-queries.ts             # OData query builders for workflows
    web-resource-queries.ts         # OData query builders for web resources
  utils/
    odata-helpers.ts                # $select, $filter, $expand builder utilities
    diff.ts                         # Generic diff engine for cross-environment comparison
    formatters.ts                   # Result formatting for MCP text responses
```

## Dynamics 365 Entity Map

```
pluginassembly (pluginassemblies)
  └── 1:N → plugintype (plugintypes) via pluginassemblyid
                └── 1:N → sdkmessageprocessingstep (sdkmessageprocessingsteps)
                            ├── N:1 → sdkmessage (sdkmessages)
                            ├── N:1 → sdkmessagefilter (sdkmessagefilters)
                            └── 1:N → sdkmessageprocessingstepimage (sdkmessageprocessingstepimages)

workflow (workflows)
  category: 0=Workflow, 1=Dialog, 2=BusinessRule, 3=Action, 4=BPF, 5=ModernFlow
  type: 1=Definition, 2=Activation
  statecode: 0=Draft, 1=Activated, 2=Suspended

webresource (webresourceset)
  webresourcetype: 1=HTML, 2=CSS, 3=JS, 4=XML, 5=PNG, 6=JPG, 7=GIF, 8=XAP, 9=XSL, 10=ICO, 11=SVG, 12=RESX
```

## Configuration

### JSON Config File

Path resolved from `D365_MCP_CONFIG` env var, or `~/.dynamics365-mcp/config.json`.

```json
{
  "environments": [
    {
      "name": "dev",
      "url": "https://dev-org.crm.dynamics.com",
      "tenantId": "...",
      "authType": "clientSecret",
      "clientId": "...",
      "clientSecret": "..."
    },
    {
      "name": "prod",
      "url": "https://prod-org.crm.dynamics.com",
      "tenantId": "...",
      "authType": "clientSecret",
      "clientId": "...",
      "clientSecret": "..."
    }
  ],
  "defaultEnvironment": "dev"
}
```

### JSON Config File With Interactive Auth

Use this when the user can sign in in a browser and does not have a client secret.

```json
{
  "environments": [
    {
      "name": "dev",
      "url": "https://dev-org.crm.dynamics.com",
      "tenantId": "...",
      "authType": "deviceCode",
      "clientId": "..."
    }
  ],
  "defaultEnvironment": "dev"
}
```

`clientId` is optional for `deviceCode`. If it is missing, the server uses a Microsoft public client ID as a fallback. This is fine for local tests, but a real public client app is better for team use.

### Connection String (single env)

Via `D365_CONNECTION_STRING` env var:

```
AuthType=ClientSecret;Url=https://org.crm.dynamics.com;ClientId=...;ClientSecret=...;TenantId=...
```

Interactive auth:

```
AuthType=DeviceCode;Url=https://org.crm.dynamics.com;TenantId=tenant;ClientId=...
```

### Connection Strings JSON (multiple envs)

Set `D365_CONNECTION_STRINGS` to JSON:

```json
{
  "environments": [
    {
      "name": "dev",
      "connectionString": "AuthType=ClientSecret;Url=https://dev-org.crm.dynamics.com;ClientId=...;ClientSecret=...;TenantId=..."
    },
    {
      "name": "prod",
      "connectionString": "AuthType=ClientSecret;Url=https://prod-org.crm.dynamics.com;ClientId=...;ClientSecret=...;TenantId=..."
    }
  ],
  "defaultEnvironment": "dev"
}
```

## Run As HTTP Service

Default mode is still `stdio`. This is best for local MCP client config.

The server also supports HTTP mode for service scripts. Use this when you want a long-running process on a fixed port.

- MCP endpoint: `/mcp`
- Health endpoint: `/health`
- Default host: `127.0.0.1`
- Default port: `3003`

### Start On macOS Or Linux

```bash
./scripts/mcp-service.sh start 3003 ~/.dynamics365-mcp/config.json
```

Stop:

```bash
./scripts/mcp-service.sh stop 3003
```

Restart:

```bash
./scripts/mcp-service.sh restart 3003 ~/.dynamics365-mcp/config.json
```

### Start On Windows

```bat
scripts\mcp-service.bat start 3003 C:\Users\you\.dynamics365-mcp\config.json
```

Stop:

```bat
scripts\mcp-service.bat stop 3003
```

Restart:

```bat
scripts\mcp-service.bat restart 3003 C:\Users\you\.dynamics365-mcp\config.json
```

The scripts store PID files in `run/` and logs in `logs/`.

The scripts also auto-load the repo `.env` file if it exists. This is useful for values like `D365_MCP_CONFIG`, `MCP_PORT`, `MCP_HOST`, `MCP_PATH`, and `NODE_BIN`.

Priority order:

- CLI arguments
- `.env`
- script defaults

## Tools

### Metadata Query Tools

| Tool                       | Description                                                   | Key Parameters                               |
| -------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `list_plugins`             | List plugin assemblies; optionally filter orphaned (no steps) | `environment`, `filter`                      |
| `list_plugin_steps`        | List registered steps for a plugin                            | `environment`, `pluginName`                  |
| `list_plugin_images`       | List pre/post images on plugin steps                          | `environment`, `pluginName`, `stepName`      |
| `get_plugin_details`       | Deep info: assembly → types → steps → images                  | `environment`, `pluginName`                  |
| `list_workflows`           | List workflows/processes with status                          | `environment`, `category`, `status`          |
| `list_actions`             | List workflow-based custom actions                            | `environment`                                |
| `get_workflow_details`     | Full workflow definition                                      | `environment`, `workflowName` / `uniqueName` |
| `list_web_resources`       | List web resources by type                                    | `environment`, `type`, `nameFilter`          |
| `get_web_resource_content` | Fetch decoded web resource content                            | `environment`, `name`                        |

### Cross-Environment Comparison Tools

| Tool                    | Description                              | Key Parameters                                                       |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `compare_plugins`       | Compare plugin registrations across envs | `sourceEnvironment`, `targetEnvironment`, `pluginName`               |
| `compare_workflows`     | Compare workflow state/definitions       | `sourceEnvironment`, `targetEnvironment`, `category`, `workflowName` |
| `compare_web_resources` | Compare web resource content             | `sourceEnvironment`, `targetEnvironment`, `type`, `nameFilter`       |
| `compare_environment_matrix` | Compare one baseline against many environments | `baselineEnvironment`, `targetEnvironments`, `componentType` |

All comparison tools return three categories: **only in source**, **only in target**, **differences** (with field-level before/after).

`compare_environment_matrix` adds a drift matrix view. It keeps the old pairwise tools for deep checks, and adds a summary table for many environments like `dev`, `test`, `pre-prod`, `prod`. For plugins it shows drift on three levels:

- plugin assemblies
- plugin steps
- plugin step images

### Comparison Output

Pairwise comparison tools are best for deep checks between two environments.

- Use `compare_plugins`, `compare_workflows`, or `compare_web_resources` when you already know the two environments you want to compare.
- Use `compare_environment_matrix` when you want one baseline, usually `prod`, and many targets like `dev`, `test`, and `pre-prod`.

Matrix status values:

- `same`: same as baseline
- `diff`: item exists in both, but fields are different
- `missing`: item exists in baseline, but not in target
- `extra`: item exists in target, but not in baseline

## Examples

### Compare One Plugin Across Two Environments

Use this when you want a detailed plugin diff, including steps and images.

```json
{
  "tool": "compare_plugins",
  "arguments": {
    "sourceEnvironment": "dev",
    "targetEnvironment": "prod",
    "pluginName": "Contoso.Plugins"
  }
}
```

### Compare Many Environments Against Prod

Use this when you want one drift report for many environments.

```json
{
  "tool": "compare_environment_matrix",
  "arguments": {
    "baselineEnvironment": "prod",
    "targetEnvironments": ["dev", "test", "pre-prod"],
    "componentType": "plugins"
  }
}
```

### Compare Plugin Drift On All Plugin Levels

Use this when you want to see plugin assembly, step, and image drift for one plugin.

```json
{
  "tool": "compare_environment_matrix",
  "arguments": {
    "baselineEnvironment": "prod",
    "targetEnvironments": ["dev", "test"],
    "componentType": "plugins",
    "pluginName": "Contoso.Plugins"
  }
}
```

### Compare Web Resources With Content

Use this when metadata is not enough and you need content hash drift too.

```json
{
  "tool": "compare_web_resources",
  "arguments": {
    "sourceEnvironment": "dev",
    "targetEnvironment": "prod",
    "type": "js",
    "nameFilter": "account",
    "compareContent": true
  }
}
```

### Get One Workflow Definition

Use `uniqueName` when possible. It is safer than display name.

```json
{
  "tool": "get_workflow_details",
  "arguments": {
    "environment": "test",
    "uniqueName": "contoso_AccountSync"
  }
}
```

## Authentication Flow

1. Tool receives request with environment name
2. `TokenManager.getToken(envName)` checks in-memory cache
3. If token is valid (not within 5 min of expiry), return cached token
4. For `clientSecret` auth, POST to `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with:
   - `grant_type=client_credentials`
   - `client_id={clientId}`
   - `client_secret={clientSecret}`
   - `scope={orgUrl}/.default`
5. For `deviceCode` auth, ask Entra for a device code, print the sign-in text to `stderr`, then poll the token endpoint until the user finishes sign-in
6. Cache new token with `expiresAt = now + expires_in - 300s`

## Cross-Environment Comparison Design

1. **Parallel fetch**: `Promise.all` queries both environments simultaneously
2. **Normalize**: Strip env-specific fields (IDs, timestamps); build lookup by stable key (`name`, `uniquename`)
3. **Diff**: Walk both maps → `{ onlyInSource, onlyInTarget, differences[] }`

## Error Handling

- **Auth failures**: `AuthenticationError` with environment name; tool returns `isError: true`
- **API errors**: Parse OData `{ error: { code, message } }` → `DynamicsApiError`
- **Config errors**: Fail fast at startup if no valid environments configured
- **Rate limits**: Respect `Retry-After` on 429 responses with automatic retry
- **Timeouts**: 30s default per request, clear error message with environment + URL

## Notes

- User input that goes into OData filters is escaped before query build.
- Plugin step and image tools use bulk fetch logic to reduce Dataverse requests.
- Pairwise compare tools are still useful. The matrix tool does not replace them.

## Usage

```json
{
  "mcpServers": {
    "dynamics-365": {
      "command": "node",
      "args": ["/path/to/dynamics-365-mcp/dist/index.js"]
    }
  }
}
```
