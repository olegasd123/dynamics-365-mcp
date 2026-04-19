# Dynamics 365 CRM MCP Server

An MCP (Model Context Protocol) server that exposes Microsoft Dynamics 365 CRM metadata through conversational tools. It supports tables, forms, views, workflows, actions, cloud flows, web resources, solutions, ALM objects, plugins, business units, security roles, impact analysis, release checks, and cross-environment comparison across multiple environments like `dev`, `test`, `pre-prod`, and `prod`.

## Docs

- [Run the MCP after cloning](./docs/run-mcp.md)
- [HTTP lifecycle](./docs/http-lifecycle.md)
- [Manual tool test prompts](./docs/prompt-examples.md)
- [Live smoke tests](./docs/live-smoke-tests.md)

## Tech Stack

- **Runtime**: Node.js 18+ (ESM)
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Transport**: `stdio` and Streamable HTTP
- **Auth**: Azure AD OAuth2 — client secret or interactive device code
- **Package manager**: npm

## Architecture

```
src/
  index.ts                    # Bootstraps config, auth, tools, prompts, resources, and transport
  config/                     # Config loading and runtime env support
  auth/                       # Client-secret and device-code token flows
  client/                     # Dataverse HTTP client, retry policy, and response cache
  http/                       # Streamable HTTP session runtime and health state
  logging/                    # Per-tool request logging and runtime error capture
  prompts/                    # Built-in MCP prompts for common Dynamics tasks
  resources/                  # Built-in MCP resources and environment starter guides
  tools/
    manifest.ts               # Single source of truth for tool grouping and README tables
    discovery/                # Broad metadata search and next-tool hints
    alm/                      # Solutions, environment variables, connection references, apps, dashboards
    tables/                   # Table schema, columns, and relationships
    forms/                    # Form inventory and normalized form detail
    views/                    # View inventory, summaries, and FetchXML
    workflows/                # Workflows, dialogs, business rules, actions, flows
    web-resources/            # Web resource inventory and content reads
    custom-apis/              # Custom API inventory and detail
    flows/                    # Cloud flow metadata and parsed summaries
    security/                 # Business units, security roles, and privileges
    usage/                    # Usage search and trigger analysis
    impact/                   # Cross-component impact reports
    health/                   # Environment health and release gate reports
    plugins/                  # Plugin classes, assemblies, steps, and images
    system-jobs/              # Async runtime jobs, failures, and bulk delete details
    comparison/               # Pairwise compare tools and drift matrix
  queries/                    # Dataverse query builders by metadata area
  utils/                      # Diff, formatting, XML metadata, batching, OData helpers
  tool-call-compatibility.ts  # Compatibility layer for MCP tool call payloads
```

The tool table below is generated from [`src/tools/manifest.ts`](./src/tools/manifest.ts), so the README tool list stays aligned with the registered tool surface.

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

Device-code tokens are stored in the OS keychain:

- macOS: Keychain Access
- Linux: Secret Service
- Windows: Credential Manager

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

## Built-in MCP Prompts

The server also exposes MCP prompts for common tasks:

- `analyze_environment_drift`
- `discover_metadata`
- `investigate_plugin_failure`
- `review_solution`
- `release_gate_check`
- `review_security_role`
- `compare_solution`
- `investigate_table_change`
- `trace_flow_dependency`

These prompts guide the client toward the right tool flow. They are useful when the user knows the task but not the exact tool names yet.

## Built-in MCP Resources

The server also exposes MCP resources for reusable context:

- `d365://guides/getting-started`
- `d365://reference/environments`
- `d365://reference/prompts`
- `d365://reference/tool-groups`
- `d365://reference/task-routing`
- `d365://reference/release-checklist`
- `d365://reference/plugin-troubleshooting`
- `d365://environments/{environment}/starter`

These resources help first-run discovery and give clients stable reference material without calling a tool first.

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

<!-- TOOL_DOCS_START -->

### Metadata Query Tools

| Tool                               | Description                                                                                                                                                                                                                          | Key Parameters                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `find_metadata`                    | Search across common Dynamics 365 metadata objects and suggest the next tool to use.                                                                                                                                                 | `environment`, `query`, `componentType`, `limit`                                                                        |
| `list_environment_variables`       | List environment variables with definition and current value metadata.                                                                                                                                                               | `environment`, `nameFilter`, `solution`                                                                                 |
| `get_environment_variable_details` | Show one environment variable with default and current value details.                                                                                                                                                                | `environment`, `variableName`, `solution`                                                                               |
| `list_connection_references`       | List connection references with connector and connection status details.                                                                                                                                                             | `environment`, `nameFilter`, `solution`                                                                                 |
| `get_connection_reference_details` | Show one connection reference with connector and connection status details.                                                                                                                                                          | `environment`, `referenceName`, `solution`                                                                              |
| `list_app_modules`                 | List app modules with state and managed status.                                                                                                                                                                                      | `environment`, `nameFilter`, `solution`                                                                                 |
| `get_app_module_details`           | Show one app module with unique name and state details.                                                                                                                                                                              | `environment`, `appName`, `solution`                                                                                    |
| `list_dashboards`                  | List dashboards with table, type, and managed status.                                                                                                                                                                                | `environment`, `nameFilter`, `solution`                                                                                 |
| `get_dashboard_details`            | Show one dashboard with table and managed status details.                                                                                                                                                                            | `environment`, `dashboardName`, `solution`                                                                              |
| `list_solutions`                   | List Dynamics 365 solutions. Users can later select a solution by display name or unique name.                                                                                                                                       | `environment`, `nameFilter`                                                                                             |
| `get_solution_details`             | Show a solution summary and list supported components like tables, apps, environment variables, plugins, and web resources.                                                                                                          | `environment`, `solution`                                                                                               |
| `get_solution_dependencies`        | Show Dataverse dependency links for supported components in one solution.                                                                                                                                                            | `environment`, `solution`, `direction`, `componentType`                                                                 |
| `list_business_units`              | List business units with parent and state details.                                                                                                                                                                                   | `environment`, `nameFilter`                                                                                             |
| `get_business_units_details`       | Show one business unit with parent and child context.                                                                                                                                                                                | `environment`, `businessUnitName`                                                                                       |
| `list_security_roles`              | List security roles with business unit context.                                                                                                                                                                                      | `environment`, `nameFilter`, `businessUnit`                                                                             |
| `get_role_privileges`              | Show privileges for one security role.                                                                                                                                                                                               | `environment`, `roleName`, `businessUnit`                                                                               |
| `list_tables`                      | List Dataverse tables with schema flags. Optionally filter by name or solution.                                                                                                                                                      | `environment`, `nameFilter`, `solution`                                                                                 |
| `get_table_schema`                 | Show table schema details, including columns, alternate keys, and relationships.                                                                                                                                                     | `environment`, `table`, `solution`                                                                                      |
| `list_table_columns`               | List Dataverse table columns with type, required level, and schema flags.                                                                                                                                                            | `environment`, `table`, `solution`                                                                                      |
| `list_table_relationships`         | List Dataverse table relationships for one table.                                                                                                                                                                                    | `environment`, `table`, `solution`                                                                                      |
| `list_table_records`               | List Dataverse table records with server-side paging. Defaults to active rows unless you ask for inactive ones.                                                                                                                      | `environment`, `table`, `nameFilter`, `createdWithinDays`, `modifiedWithinDays`, `state`                                |
| `get_table_record_details`         | Show one Dataverse table record by id or common name fields. Defaults to active rows, returns a compact field set by default, and returns structured choices for ambiguous matches.                                                  | `environment`, `table`, `recordId`, `name`, `firstName`, `lastName`, `state`, `includeAllFields`, `limit`, `cursor`     |
| `list_audit_history`               | List Dataverse audit history for one table over a time window, or for one record when you provide a row lookup.                                                                                                                      | `environment`, `table`, `recordId`, `name`, `firstName`, `lastName`, `createdAfter`, `createdBefore`, `limit`, `cursor` |
| `list_forms`                       | List model-driven app forms. Supports main, quick create, and card forms.                                                                                                                                                            | `environment`, `table`, `type`, `solution`                                                                              |
| `get_form_details`                 | Show one form with a normalized XML summary.                                                                                                                                                                                         | `environment`, `formName`, `table`, `solution`                                                                          |
| `list_table_ribbons`               | List table ribbons and the buttons available on each ribbon.                                                                                                                                                                         | `environment`, `table`, `location`                                                                                      |
| `get_ribbon_button_details`        | Show command, rule, and image details for one ribbon button by name or ID.                                                                                                                                                           | `environment`, `table`, `buttonName`, `location`                                                                        |
| `list_views`                       | List system or personal views with normalized metadata.                                                                                                                                                                              | `environment`, `table`, `scope`, `solution`                                                                             |
| `get_view_details`                 | Show one view with normalized FetchXML and layout summary.                                                                                                                                                                           | `environment`, `viewName`, `table`, `scope`                                                                             |
| `get_view_fetchxml`                | Return normalized FetchXML for one system or personal view.                                                                                                                                                                          | `environment`, `viewName`, `table`, `scope`                                                                             |
| `list_plugins`                     | List plugin classes (IPlugin implementations, also called plugin types) registered in Dynamics 365. Workflow activities (CodeActivity) are excluded. Use filter='no_steps' to find orphaned plugin classes with no registered steps. | `environment`, `filter`, `solution`                                                                                     |
| `list_plugin_steps`                | List registered steps (message processing steps) for one plugin class in Dynamics 365. Workflow activities (CodeActivity) are excluded.                                                                                              | `environment`, `pluginName`, `assemblyName`, `solution`                                                                 |
| `get_plugin_details`               | Get detailed information about one plugin class including its assembly, steps, and images. Workflow activities (CodeActivity) are excluded.                                                                                          | `environment`, `pluginName`, `assemblyName`, `solution`                                                                 |
| `list_plugin_assemblies`           | List plugin assemblies registered in Dynamics 365. Use filter='no_steps' to find orphaned plugin assemblies with no registered steps.                                                                                                | `environment`, `filter`, `solution`                                                                                     |
| `list_plugin_assembly_steps`       | List registered steps (message processing steps) for a plugin assembly in Dynamics 365.                                                                                                                                              | `environment`, `assemblyName`                                                                                           |
| `list_plugin_assembly_images`      | List pre/post entity images registered on steps for a plugin assembly in Dynamics 365.                                                                                                                                               | `environment`, `assemblyName`, `stepName`, `message`                                                                    |
| `get_plugin_assembly_details`      | Get detailed information about a plugin assembly. Output separates plugin classes and workflow activities.                                                                                                                           | `environment`, `assemblyName`                                                                                           |
| `list_plugin_trace_logs`           | List Dataverse plug-in trace logs with filters for plugin class, correlation id, time range, and exception presence.                                                                                                                 | `environment`, `pluginName`, `correlationId`, `createdAfter`, `createdBefore`, `hasException`, `limit`, `cursor`        |
| `get_plugin_trace_log_details`     | Show one Dataverse plug-in trace log with full runtime details.                                                                                                                                                                      | `environment`, `pluginTraceLogId`                                                                                       |
| `list_system_jobs`                 | List Dataverse system jobs with filters for runtime status, job type, time range, and failures.                                                                                                                                      | `environment`, `status`, `jobType`, `correlationId`, `createdAfter`, `completedAfter`, `failedOnly`, `limit`, `cursor`  |
| `get_system_job_details`           | Show one Dataverse system job with runtime status, message details, and related workflow, plug-in, or bulk delete context.                                                                                                           | `environment`, `systemJobId`                                                                                            |
| `list_workflows`                   | List workflows and processes in Dynamics 365 with their status.                                                                                                                                                                      | `environment`, `category`, `status`, `solution`                                                                         |
| `list_actions`                     | List custom actions registered in Dynamics 365.                                                                                                                                                                                      | `environment`, `solution`                                                                                               |
| `get_workflow_details`             | Get detailed information about a specific workflow including triggers, scope, and definition. `uniqueName` also accepts a workflow id.                                                                                               | `environment`, `workflowName`, `uniqueName`                                                                             |
| `list_web_resources`               | List web resources in Dynamics 365, optionally filtered by type or name.                                                                                                                                                             | `environment`, `type`, `nameFilter`, `solution`                                                                         |
| `get_web_resource_content`         | Fetch the content of a specific web resource from Dynamics 365 by name or web resource id.                                                                                                                                           | `environment`, `name`                                                                                                   |
| `list_custom_apis`                 | List Dataverse Custom APIs with binding and execution settings.                                                                                                                                                                      | `environment`, `nameFilter`                                                                                             |
| `get_custom_api_details`           | Show one Custom API with request and response metadata.                                                                                                                                                                              | `environment`, `apiName`                                                                                                |
| `list_cloud_flows`                 | List cloud flows stored in Dataverse workflow metadata.                                                                                                                                                                              | `environment`, `status`, `solution`                                                                                     |
| `get_flow_details`                 | Show cloud flow metadata and a parsed summary of triggers, actions, and connections.                                                                                                                                                 | `environment`, `flowName`, `solution`                                                                                   |
| `find_table_usage`                 | Find where one Dataverse table is used across metadata assets.                                                                                                                                                                       | `environment`, `table`                                                                                                  |
| `find_column_usage`                | Find where one Dataverse column is used across metadata assets.                                                                                                                                                                      | `environment`, `column`, `table`                                                                                        |
| `find_web_resource_usage`          | Find where one web resource is used in forms and other text web resources. `name` can be a web resource name or id.                                                                                                                  | `environment`, `name`                                                                                                   |
| `find_workflow_activity_usage`     | Find workflow processes (category Workflow) whose XAML or clientdata references a custom workflow activity (`CodeActivity`) class.                                                                                                   | `environment`, `className`, `solution`, `status`                                                                        |
| `analyze_create_triggers`          | Analyze what direct create triggers can run for a Dataverse table create.                                                                                                                                                            | `environment`, `table`, `providedAttributes`                                                                            |
| `analyze_update_triggers`          | Analyze what direct update triggers can run for a Dataverse table change.                                                                                                                                                            | `environment`, `table`, `changedAttributes`                                                                             |
| `analyze_impact`                   | Analyze likely impact for a table, column, plugin assembly, workflow, cloud flow, web resource, or solution.                                                                                                                         | `environment`, `componentType`, `name`                                                                                  |
| `environment_health_report`        | Build a health report for one environment or one solution in one environment.                                                                                                                                                        | `environment`, `solution`                                                                                               |
| `release_gate_report`              | Build an opinionated go or no-go report for moving one solution.                                                                                                                                                                     | `environment`, `solution`, `targetEnvironment`, `strict`                                                                |

### Cross-Environment Comparison Tools

| Tool                         | Description                                                                                                                                                               | Key Parameters                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `compare_plugin_assemblies`  | Compare plugin assemblies and their registrations between two Dynamics 365 environments.                                                                                  | `sourceEnvironment`, `targetEnvironment`, `assemblyName`                                                                             |
| `compare_solutions`          | Compare supported solution components between two environments for one solution.                                                                                          | `sourceEnvironment`, `targetEnvironment`, `solution`                                                                                 |
| `compare_workflows`          | Compare workflows between two Dynamics 365 environments. Useful for checking if a workflow is enabled/disabled across environments.                                       | `sourceEnvironment`, `targetEnvironment`, `category`, `workflowName`                                                                 |
| `compare_web_resources`      | Compare web resources between two Dynamics 365 environments.                                                                                                              | `sourceEnvironment`, `targetEnvironment`, `type`, `nameFilter`                                                                       |
| `compare_environment_matrix` | Compare one baseline environment against many target environments and show a drift matrix for plugin assemblies with their steps and images, workflows, or web resources. | `baselineEnvironment`, `targetEnvironments`, `componentType`                                                                         |
| `compare_table_schema`       | Compare one Dataverse table schema across two environments.                                                                                                               | `sourceEnvironment`, `targetEnvironment`, `table`, `targetTable`                                                                     |
| `compare_forms`              | Compare system forms between two environments using normalized XML summaries.                                                                                             | `sourceEnvironment`, `targetEnvironment`, `table`, `type`, `solution`                                                                |
| `compare_views`              | Compare system or personal views between two environments using normalized XML summaries.                                                                                 | `sourceEnvironment`, `targetEnvironment`, `table`, `scope`, `solution`                                                               |
| `compare_custom_apis`        | Compare Custom APIs and their request and response metadata between two environments.                                                                                     | `sourceEnvironment`, `targetEnvironment`, `apiName`                                                                                  |
| `compare_security_roles`     | Compare one security role between two environments. Supports per-environment role and business unit overrides when one side needs disambiguation.                         | `sourceEnvironment`, `targetEnvironment`, `roleName`, `sourceRoleName`, `targetRoleName`, `sourceBusinessUnit`, `targetBusinessUnit` |

<!-- TOOL_DOCS_END -->

### Structured Ambiguity Handling

Many detail tools return a structured `ambiguous_match` error when a lookup is not unique.

- Retry with the `parameter` named in the error payload.
- Use one of the provided `options[].value` entries. These values are stable identifiers like ids, logical names, or unique names when available.
- For security role tools, omitting `businessUnit` still defaults to the environment's default global business unit, so prompts like `give me details for security role "Managers"` continue to resolve the root business unit role unless you specify a different business unit.

### Solution-Aware Filtering

Users can now work with a solution by display name or unique name.

- `list_plugins` supports `solution`
- `list_plugin_assemblies` supports `solution`
- `list_workflows` supports `solution`
- `list_actions` supports `solution`
- `find_workflow_activity_usage` supports `solution`
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

### List Recent Plugin Trace Logs

Use this when metadata looks correct but the runtime still fails and you need recent trace logs for one plugin class or correlation id.

```json
{
  "tool": "list_plugin_trace_logs",
  "arguments": {
    "environment": "dev",
    "pluginName": "Contoso.Plugins.AccountPlugin",
    "createdAfter": "2026-04-20T08:00:00Z",
    "hasException": true,
    "limit": 10
  }
}
```

### Get One Plugin Trace Log

Use this when you already have one `pluginTraceLogId` from `list_plugin_trace_logs` and need the full exception and trace text.

```json
{
  "tool": "get_plugin_trace_log_details",
  "arguments": {
    "environment": "dev",
    "pluginTraceLogId": "00000000-0000-0000-0000-000000000001"
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
3. For `deviceCode` auth, check the OS keychain for a saved token
4. If a valid access token exists, return it
5. If a stored refresh token exists, try silent refresh before asking the user to sign in again
6. For `clientSecret` auth, POST to `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with:
   - `grant_type=client_credentials`
   - `client_id={clientId}`
   - `client_secret={clientSecret}`
   - `scope={orgUrl}/.default`
7. For `deviceCode` auth, if silent refresh is not possible, ask Entra for a device code, print the sign-in text to `stderr`, then poll the token endpoint until the user finishes sign-in
8. Cache the new access token in memory and save device-code tokens in the OS keychain when possible

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
- **Tool error envelopes**: `structuredContent.error` keeps `name` and `message`, and adds machine-readable fields for known errors like `code`, `environment`, `statusCode`, `odataErrorCode`, `kind`, and `retryable`

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
