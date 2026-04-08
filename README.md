# Dynamics 365 CRM MCP Server

An MCP (Model Context Protocol) server that exposes Microsoft Dynamics 365 CRM metadata through conversational tools. It supports tables, forms, views, workflows, actions, cloud flows, web resources, solutions, ALM objects, plugins, and cross-environment comparison across multiple environments (dev, test, pre-prod, prod, etc.).

## Docs

- [Run the MCP after cloning](./docs/run-mcp.md)
- [Manual tool test prompts](./docs/prompt-examples.md)

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
    alm/
      list-environment-variables.ts
      get-environment-variable-details.ts
      list-connection-references.ts
      get-connection-reference-details.ts
      list-app-modules.ts
      get-app-module-details.ts
      list-dashboards.ts
      get-dashboard-details.ts
    tables/
      list-tables.ts
      get-table-schema.ts
      list-table-columns.ts
      list-table-relationships.ts
    discovery/
      find-metadata.ts
    forms/
      list-forms.ts
      get-form-details.ts
    views/
      list-views.ts
      get-view-details.ts
      get-view-fetchxml.ts
    custom-apis/
      list-custom-apis.ts
      get-custom-api-details.ts
    flows/
      list-cloud-flows.ts
      get-flow-details.ts
    security/
      list-security-roles.ts
      get-role-privileges.ts
    usage/
      find-table-usage.ts
      find-column-usage.ts
      find-web-resource-usage.ts
    health/
      environment-health-report.ts
    plugins/
      list-plugins.ts
      list-plugin-steps.ts
      get-plugin-details.ts
      list-plugin-assemblies.ts
      list-plugin-assembly-steps.ts
      list-plugin-assembly-images.ts
      get-plugin-assembly-details.ts
      plugin-class-metadata.ts
    workflows/
      list-workflows.ts
      list-actions.ts
      get-workflow-details.ts
    web-resources/
      list-web-resources.ts
      get-web-resource-content.ts
    solutions/
      list-solutions.ts
      get-solution-details.ts
      get-solution-dependencies.ts
    comparison/
      compare-table-schema.ts
      compare-forms.ts
      compare-views.ts
      compare-custom-apis.ts
      compare-security-roles.ts
      compare-plugin-assemblies.ts
      compare-solutions.ts
      compare-workflows.ts
      compare-web-resources.ts
      compare-environment-matrix.ts
  queries/
    table-queries.ts                # Dataverse table metadata query builders
    form-queries.ts                 # Form metadata query builders
    view-queries.ts                 # View metadata query builders
    custom-api-queries.ts           # Custom API metadata query builders
    flow-queries.ts                 # Cloud flow query builders on workflow metadata
    alm-queries.ts                  # Environment variables, connection references, and app module query builders
    dashboard-queries.ts            # Dashboard query builders on system forms
    security-queries.ts             # Security role and privilege query builders
    plugin-queries.ts               # OData query builders for plugin assemblies, types, steps, and images
    workflow-queries.ts             # OData query builders for workflows
    web-resource-queries.ts         # OData query builders for web resources
    solution-queries.ts             # OData query builders for solutions and solution components
    dependency-queries.ts           # Dataverse dependency function query helpers
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

Path resolved from `D365_MCP_CONFIG` env var, or `~/.dynamics-365-mcp/config.json`.

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

Device-code tokens are stored in `~/.dynamics-365-mcp/token-cache.json` by default. Set `D365_MCP_TOKEN_CACHE` if you want another path.

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
./scripts/mcp-service.sh start 3003 ~/.dynamics-365-mcp/config.json
```

Stop:

```bash
./scripts/mcp-service.sh stop 3003
```

Restart:

```bash
./scripts/mcp-service.sh restart 3003 ~/.dynamics-365-mcp/config.json
```

### Start On Windows

```bat
scripts\mcp-service.bat start 3003 C:\Users\you\.dynamics-365-mcp\config.json
```

Stop:

```bat
scripts\mcp-service.bat stop 3003
```

Restart:

```bat
scripts\mcp-service.bat restart 3003 C:\Users\you\.dynamics-365-mcp\config.json
```

The scripts store PID files in `~/.dynamics-365-mcp/run/` and service logs in `~/.dynamics-365-mcp/logs/` by default.

The scripts also auto-load the repo `.env` file if it exists. This is useful for values like `D365_MCP_CONFIG`, `MCP_PORT`, `MCP_HOST`, `MCP_PATH`, and `NODE_BIN`.

In HTTP mode, `/health` returns a JSON summary with service info, config info, request counters, auth cache state, and client cache state.

Priority order:

- CLI arguments
- `.env`
- script defaults

## Tools

### Metadata Query Tools

| Tool                          | Description                                                               | Key Parameters                                          |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| `list_tables`                 | List Dataverse tables with main schema flags                              | `environment`, `nameFilter`, `solution`                 |
| `get_table_schema`            | Show columns, alternate keys, and relationships for one table             | `environment`, `table`, `solution`                      |
| `list_table_columns`          | List table columns and choice details                                     | `environment`, `table`, `solution`                      |
| `list_table_relationships`    | List table relationships                                                  | `environment`, `table`, `solution`                      |
| `list_forms`                  | List model-driven forms                                                   | `environment`, `table`, `type`, `solution`              |
| `get_form_details`            | Show one form with normalized XML summary                                 | `environment`, `formName`, `table`, `solution`          |
| `list_views`                  | List system or personal views                                             | `environment`, `table`, `scope`, `solution`             |
| `get_view_details`            | Show one view with normalized query summary                               | `environment`, `viewName`, `table`, `scope`             |
| `get_view_fetchxml`           | Return normalized FetchXML for one view                                   | `environment`, `viewName`, `table`, `scope`             |
| `list_custom_apis`            | List Dataverse Custom APIs                                                | `environment`, `nameFilter`                             |
| `get_custom_api_details`      | Show Custom API request and response metadata                             | `environment`, `apiName`                                |
| `list_cloud_flows`            | List cloud flows from workflow metadata                                   | `environment`, `status`, `solution`                     |
| `get_flow_details`            | Show one cloud flow with parsed trigger/action summary                    | `environment`, `flowName`, `solution`                   |
| `list_security_roles`         | List security roles                                                       | `environment`, `nameFilter`                             |
| `get_role_privileges`         | Show privileges for one role                                              | `environment`, `roleName`, `businessUnit`               |
| `find_table_usage`            | Find where one table is used                                              | `environment`, `table`                                  |
| `find_column_usage`           | Find where one column is used                                             | `environment`, `column`, `table`                        |
| `find_web_resource_usage`     | Find where one web resource is used                                       | `environment`, `name`                                   |
| `analyze_create_triggers`     | Analyze direct create triggers for a table create                         | `environment`, `table`, `providedAttributes`            |
| `analyze_update_triggers`     | Analyze direct update triggers for a table change                         | `environment`, `table`, `changedAttributes`             |
| `analyze_impact`              | Build one impact report for a component or solution                       | `environment`, `componentType`, `name`                  |
| `environment_health_report`   | Build a release-health summary                                            | `environment`, `solution`                               |
| `list_plugins`                | List plugin classes; optionally filter orphaned (no steps)                | `environment`, `filter`, `solution`                     |
| `list_plugin_steps`           | List registered steps for one plugin class                                | `environment`, `pluginName`, `assemblyName`, `solution` |
| `get_plugin_details`          | Deep info for one plugin class with steps and images                      | `environment`, `pluginName`, `assemblyName`, `solution` |
| `list_plugin_assemblies`      | List plugin assemblies; optionally filter orphaned (no steps)             | `environment`, `filter`, `solution`                     |
| `list_plugin_assembly_steps`  | List registered steps for one plugin assembly                             | `environment`, `assemblyName`                           |
| `list_plugin_assembly_images` | List pre/post images on steps for one plugin assembly                     | `environment`, `assemblyName`, `stepName`, `message`    |
| `get_plugin_assembly_details` | Deep info: assembly → plugin classes/workflow activities → steps → images | `environment`, `assemblyName`                           |
| `list_solutions`              | List solutions by display name and unique name                            | `environment`, `nameFilter`                             |
| `get_solution_details`        | Show solution summary and supported ALM component groups                  | `environment`, `solution`                               |
| `get_solution_dependencies`   | Show dependency links for supported solution components                   | `environment`, `solution`, `direction`, `componentType` |
| `list_workflows`              | List workflows/processes with status                                      | `environment`, `category`, `status`                     |
| `list_actions`                | List workflow-based custom actions                                        | `environment`                                           |
| `get_workflow_details`        | Full workflow definition                                                  | `environment`, `workflowName` / `uniqueName`            |
| `list_web_resources`          | List web resources by type                                                | `environment`, `type`, `nameFilter`                     |
| `get_web_resource_content`    | Fetch decoded web resource content                                        | `environment`, `name`                                   |

### Cross-Environment Comparison Tools

| Tool                         | Description                                    | Key Parameters                                                         |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `compare_table_schema`       | Compare one table schema across envs           | `sourceEnvironment`, `targetEnvironment`, `table`, `targetTable`       |
| `compare_forms`              | Compare forms across envs                      | `sourceEnvironment`, `targetEnvironment`, `table`, `type`, `solution`  |
| `compare_views`              | Compare views across envs                      | `sourceEnvironment`, `targetEnvironment`, `table`, `scope`, `solution` |
| `compare_custom_apis`        | Compare Custom APIs across envs                | `sourceEnvironment`, `targetEnvironment`, `apiName`                    |
| `compare_security_roles`     | Compare security roles across envs             | `sourceEnvironment`, `targetEnvironment`, `roleName`                   |
| `compare_plugin_assemblies`  | Compare plugin assemblies across envs          | `sourceEnvironment`, `targetEnvironment`, `assemblyName`               |
| `compare_solutions`          | Compare supported solution components          | `sourceEnvironment`, `targetEnvironment`, `solution`                   |
| `compare_workflows`          | Compare workflow state/definitions             | `sourceEnvironment`, `targetEnvironment`, `category`, `workflowName`   |
| `compare_web_resources`      | Compare web resource content                   | `sourceEnvironment`, `targetEnvironment`, `type`, `nameFilter`         |
| `compare_environment_matrix` | Compare one baseline against many environments | `baselineEnvironment`, `targetEnvironments`, `componentType`           |

### Solution-Aware Filtering

Users can now work with a solution by display name or unique name.

- `list_plugins` supports `solution`
- `list_plugin_assemblies` supports `solution`
- `list_workflows` supports `solution`
- `list_actions` supports `solution`
- `list_web_resources` supports `solution`
- `list_tables` supports `solution`
- `get_table_schema` supports `solution`
- `list_table_columns` supports `solution`
- `list_table_relationships` supports `solution`
- `list_forms` supports `solution`
- `get_form_details` supports `solution`
- `list_views` supports `solution` for system views
- `get_view_details` supports `solution` for system views
- `get_view_fetchxml` supports `solution` for system views
- `list_cloud_flows` supports `solution`
- `get_flow_details` supports `solution`

The server resolves the solution first, then filters supported solution components from that solution.

### Plugin Boundary

- `list_plugins`, `list_plugin_steps`, and `get_plugin_details` return plugin classes only.
- These tools exclude workflow activities. A type is treated as workflow activity when Dataverse marks `isworkflowactivity=true` or fills workflow-only fields like `workflowactivitygroupname` or `customworkflowactivityinfo`.
- `list_plugin_assemblies`, `list_plugin_assembly_steps`, `list_plugin_assembly_images`, and `get_plugin_assembly_details` work at plugin assembly level.
- Use `get_plugin_assembly_details` when you need the full assembly view, including workflow activities.
- Dataverse can store other handlers as plugin types. Until a separate tool exists, those handlers can still appear in plugin-class results when they are not marked as workflow activities.

### Supported Solution Coverage

`get_solution_details`, `get_solution_dependencies`, and solution-scoped health checks now understand these solution component groups:

- tables
- columns
- security roles
- forms
- views
- workflows
- dashboards
- web resources
- app modules
- connection references
- environment variable definitions
- environment variable values
- plugin assemblies
- plugin steps
- plugin images

### Dependency View

Use `get_solution_dependencies` when you want to see which supported solution components:

- require other components
- are used by other components
- point outside the current solution

This tool uses Dataverse dependency functions instead of guessing links from names.

`componentType` can now target both old and new groups like `table`, `column`, `security_role`, `dashboard`, `app_module`, `connection_reference`, `environment_variable_definition`, and `environment_variable_value`.

### Impact Analysis

Use `analyze_impact` when you want one report for likely change impact.

- Supported targets: table, column, plugin assembly, workflow, flow, web resource, and solution
- The `analyze_impact` tool still uses `componentType: "plugin"` for plugin assembly impact
- The report reuses current usage and dependency logic where possible
- The summary shows risk level, total references, dependency count, and likely affected areas
- Detailed sections are added only when data exists, like forms, views, plugin steps, cloud flows, or dependencies

### Performance Notes

- Repeated metadata reads now use a short in-memory cache inside the Dynamics client.
- Solution-scoped table, form, view, and cloud flow reads now use targeted id lookups where possible.
- Large id-based metadata fetches are split into smaller chunks.
- Expensive compare and usage tools now add warnings when detail scans are limited for safety.

See [docs/performance-notes.md](docs/performance-notes.md) for the protected test fixtures behind these changes.

All comparison tools return three categories: **only in source**, **only in target**, **differences** (with field-level before/after).

`compare_environment_matrix` adds a drift matrix view. It keeps the old pairwise tools for deep checks, and adds a summary table for many environments like `dev`, `test`, `pre-prod`, `prod`. For plugin assemblies it shows drift on three levels:

- plugin assemblies
- plugin steps
- plugin step images

### Comparison Output

Pairwise comparison tools are best for deep checks between two environments.

- Use `compare_plugin_assemblies`, `compare_workflows`, or `compare_web_resources` when you already know the two environments you want to compare.
- Use `compare_environment_matrix` when you want one baseline, usually `prod`, and many targets like `dev`, `test`, and `pre-prod`.

Matrix status values:

- `same`: same as baseline
- `diff`: item exists in both, but fields are different
- `missing`: item exists in baseline, but not in target
- `extra`: item exists in target, but not in baseline

## Structured Output

All tools now return two result forms at the same time:

- `content`: readable text for users
- `structuredContent`: stable JSON for agents and follow-up tool logic

The top-level JSON shape is the same for every tool:

```json
{
  "version": "1",
  "tool": "tool_name",
  "ok": true,
  "summary": "Short summary",
  "data": {}
}
```

Error shape:

```json
{
  "version": "1",
  "tool": "tool_name",
  "ok": false,
  "error": {
    "name": "Error",
    "message": "Error text"
  }
}
```

The `data` payload depends on the tool, but it follows the same idea:

- list tools usually return fields like `environment`, `filters`, `count`, and `items`
- detail tools usually return one main object like `table`, `view`, `form`, `flow`, `plugin class`, `plugin assembly`, or `solution`
- compare tools usually return environment names, filters, and one or more diff objects
- error results always use the shared `error.name` and `error.message` fields

This means an MCP client or another agent can read the text for people, or use `structuredContent` for stable follow-up logic without parsing markdown tables.

## Examples

### List Plugin Classes In One Solution

Use this when you want `IPlugin` classes (plugin types), not assemblies or `CodeActivity` workflow classes.

```json
{
  "tool": "list_plugins",
  "arguments": {
    "environment": "dev",
    "solution": "Contoso Core",
    "filter": "no_steps"
  }
}
```

### List Plugin Assemblies In One Solution

Use this when you want DLL-level registration, not plugin classes.

```json
{
  "tool": "list_plugin_assemblies",
  "arguments": {
    "environment": "dev",
    "solution": "Contoso Core",
    "filter": "no_steps"
  }
}
```

### List Steps For One Plugin Class

Use this when you already know the plugin class and want only its registered steps.

```json
{
  "tool": "list_plugin_steps",
  "arguments": {
    "environment": "dev",
    "pluginName": "Contoso.Plugins.AccountPlugin",
    "assemblyName": "Contoso.Plugins"
  }
}
```

### Get One Plugin Class

Use this when you want one plugin class with its registered steps and images.

```json
{
  "tool": "get_plugin_details",
  "arguments": {
    "environment": "dev",
    "pluginName": "Contoso.Plugins.AccountPlugin"
  }
}
```

### Inspect One Plugin Assembly With Workflow Activities

Use this when you want the full assembly view, including workflow activities stored in the same assembly.

```json
{
  "tool": "get_plugin_assembly_details",
  "arguments": {
    "environment": "dev",
    "assemblyName": "Contoso.Plugins"
  }
}
```

### Compare One Plugin Assembly Across Two Environments

Use this when you want a detailed plugin assembly diff, including steps and images.

```json
{
  "tool": "compare_plugin_assemblies",
  "arguments": {
    "sourceEnvironment": "dev",
    "targetEnvironment": "prod",
    "assemblyName": "Contoso.Plugins"
  }
}
```

### Compare Many Environments Against Prod

Use this when you want one drift report for many environments across plugin assemblies, workflows, and web resources.

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

### Compare Plugin Assembly Drift On All Registration Levels

Use this when you want to see plugin assembly, step, and image drift for one plugin assembly.

```json
{
  "tool": "compare_environment_matrix",
  "arguments": {
    "baselineEnvironment": "prod",
    "targetEnvironments": ["dev", "test"],
    "componentType": "plugins",
    "assemblyName": "Contoso.Plugins"
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

### Analyze Impact For One Plugin Assembly

Use this when you want one report that combines direct usage and dependency risk for one plugin assembly. The input still uses `componentType: "plugin"`.

```json
{
  "tool": "analyze_impact",
  "arguments": {
    "environment": "dev",
    "componentType": "plugin",
    "name": "Contoso.Plugins"
  }
}
```

## Authentication Flow

1. Tool receives request with environment name
2. `TokenManager.getToken(envName)` checks in-memory cache
3. For `deviceCode` auth, check the persisted token cache on disk
4. If a valid access token exists, return it
5. If a stored refresh token exists, try silent refresh before asking the user to sign in again
6. For `clientSecret` auth, POST to `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with:
   - `grant_type=client_credentials`
   - `client_id={clientId}`
   - `client_secret={clientSecret}`
   - `scope={orgUrl}/.default`
7. For `deviceCode` auth, if silent refresh is not possible, ask Entra for a device code, print the sign-in text to `stderr`, then poll the token endpoint until the user finishes sign-in
8. Cache the new access token in memory and save device-code tokens to disk when possible

## Cross-Environment Comparison Design

1. **Parallel fetch**: `Promise.all` queries both environments simultaneously
2. **Normalize**: Strip env-specific fields (IDs, timestamps); build lookup by stable key (`name`, `uniquename`)
3. **Diff**: Walk both maps → `{ onlyInSource, onlyInTarget, differences[] }`

## Error Handling

- **Auth failures**: `AuthenticationError` with environment name; tool returns `isError: true`
- **API errors**: Parse OData `{ error: { code, message } }` → `DynamicsApiError`
- **Config errors**: Fail fast at startup if no valid environments configured
- **Unauthorized responses**: On the first `401`, clear the cached token, refresh it once, and retry once
- **Transient failures**: Retry `408`, `429`, `500`, `502`, `503`, `504`, plus selected timeout and network errors with backoff
- **Rate limits**: Respect `Retry-After` when Dataverse returns it
- **Timeouts and network errors**: Use `DynamicsRequestError` with clear environment and request URL details

## Optional Request Logs

Set `D365_MCP_LOG_ENABLED=true` to write request logs to `~/.dynamics-365-mcp/logs/DDMMYYYY`.

Each tool call writes one log file. The file can include:

- tool input
- Dataverse request and response data
- formatted `createToolSuccessResponse` / `createToolErrorResponse` output
- errors seen during that tool call

Optional settings:

- `D365_MCP_LOG_DIR=~/.dynamics-365-mcp/logs`
- `D365_MCP_LOG_MAX_BODY_CHARS=0`

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

## Testing

Run the full suite:

```bash
npm test
```

Run only the runtime transport smoke tests:

```bash
npm run test:transport
```

Run only the MCP tool contract tests:

```bash
npm run test:contracts
```
