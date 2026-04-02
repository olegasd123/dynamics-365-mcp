# Dynamics 365 CRM MCP Server — Implementation Plan

## Implementation Phases

### Phase 1 — Foundation
- `package.json`, `tsconfig.json`, `.env.example`
- Config types and loader
- Token manager
- Dynamics Web API client
- MCP server entry point (no tools yet)

### Phase 2 — Plugin Tools
- OData query builders for plugin entities
- `list_plugins`, `list_plugin_steps`, `list_plugin_images`, `get_plugin_details`

### Phase 3 — Workflow & Action Tools
- OData query builders for workflows
- `list_workflows`, `list_actions`, `get_workflow_details`

### Phase 4 — Web Resource Tools
- OData query builders for web resources
- `list_web_resources`, `get_web_resource_content`

### Phase 5 — Comparison Tools
- Generic diff utility
- `compare_plugins`, `compare_workflows`, `compare_web_resources`

### Phase 6 — Polish
- Result formatters
- OData helper extraction
- Tool registration barrel
- README, .env.example
- Build & distribution setup
