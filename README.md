# Dynamics 365 CRM MCP Server

An MCP (Model Context Protocol) server that exposes Microsoft Dynamics 365 CRM metadata through conversational tools. Supports querying plugins, workflows, actions, web resources, and comparing configurations across multiple environments (dev, test, pre-prod, prod, etc.).

## Tech Stack

- **Runtime**: Node.js 18+ (ESM)
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Transport**: stdio
- **Auth**: Azure AD OAuth2 — client credentials flow (app registration + client secret)
- **Package manager**: npm

## Architecture

```
src/
  index.ts                          # Entry point: McpServer + StdioServerTransport
  config/
    types.ts                        # Environment config interfaces
    environments.ts                 # Config loader (JSON file, env vars, connection string)
  auth/
    token-manager.ts                # OAuth2 client credentials + per-env token cache
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
      "clientId": "...",
      "clientSecret": "..."
    },
    {
      "name": "prod",
      "url": "https://prod-org.crm.dynamics.com",
      "tenantId": "...",
      "clientId": "...",
      "clientSecret": "..."
    }
  ],
  "defaultEnvironment": "dev"
}
```

### Connection String (single env)

Via `D365_CONNECTION_STRING` env var:

```
AuthType=ClientSecret;Url=https://org.crm.dynamics.com;ClientId=...;ClientSecret=...;TenantId=...
```

### Individual Env Vars (single env)

```
D365_URL=https://org.crm.dynamics.com
D365_TENANT_ID=...
D365_CLIENT_ID=...
D365_CLIENT_SECRET=...
```

## Tools

### Metadata Query Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `list_plugins` | List plugin assemblies; optionally filter orphaned (no steps) | `environment`, `filter` |
| `list_plugin_steps` | List registered steps for a plugin | `environment`, `pluginName` |
| `list_plugin_images` | List pre/post images on plugin steps | `environment`, `pluginName`, `stepName` |
| `get_plugin_details` | Deep info: assembly → types → steps → images | `environment`, `pluginName` |
| `list_workflows` | List workflows/processes with status | `environment`, `category`, `status` |
| `list_actions` | List custom actions and custom APIs | `environment` |
| `get_workflow_details` | Full workflow definition | `environment`, `workflowName` / `uniqueName` |
| `list_web_resources` | List web resources by type | `environment`, `type`, `nameFilter` |
| `get_web_resource_content` | Fetch decoded web resource content | `environment`, `name` |

### Cross-Environment Comparison Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `compare_plugins` | Compare plugin registrations across envs | `sourceEnvironment`, `targetEnvironment`, `pluginName` |
| `compare_workflows` | Compare workflow state/definitions | `sourceEnvironment`, `targetEnvironment`, `category`, `workflowName` |
| `compare_web_resources` | Compare web resource content | `sourceEnvironment`, `targetEnvironment`, `type`, `nameFilter` |

All comparison tools return three categories: **only in source**, **only in target**, **differences** (with field-level before/after).

## Authentication Flow

1. Tool receives request with environment name
2. `TokenManager.getToken(envName)` checks in-memory cache
3. If token is valid (not within 5 min of expiry), return cached token
4. Otherwise, POST to `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with:
   - `grant_type=client_credentials`
   - `client_id={clientId}`
   - `client_secret={clientSecret}`
   - `scope={orgUrl}/.default`
5. Cache new token with `expiresAt = now + expires_in - 300s`

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
