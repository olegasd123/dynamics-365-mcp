# Dynamics 365 MCP Roadmap

## Goal

Expand the MCP from a strong metadata reader for plugins, workflows, web resources, and solutions into a broader Dataverse analysis tool.

Keep the same product style:

- read-only tools
- comparison-first design
- clear text output for MCP clients
- good support for multi-environment ALM checks

## Current Base

The current server already covers:

- plugins
- workflows and actions
- web resources
- solutions
- cross-environment comparison

The next work should extend this model instead of changing it.

## Milestone 1: Table Metadata

Status: Done

### Goal

Make the MCP useful for schema work, not only plugin and workflow work.

### Tools

- `list_tables`
- `get_table_schema`
- `list_table_columns`
- `list_table_relationships`
- `compare_table_schema`

### Scope

- tables
- columns
- choice fields
- alternate keys
- relationships
- audit and search flags
- optional `solution` filter where possible

### Repo Shape

- `src/queries/table-queries.ts`
- `src/tools/tables/*`
- `src/tools/comparison/compare-table-schema.ts`

### Why First

- highest user value
- many Dataverse questions start with tables and columns
- fits the current query and compare architecture well

## Milestone 2: App Layer Metadata

Status: Done

### Goal

Cover model-driven app UI assets.

### Tools

- `list_forms`
- `get_form_details`
- `list_views`
- `get_view_details`
- `get_view_fetchxml`
- `compare_forms`
- `compare_views`

### Scope

- main forms
- quick create forms
- card forms
- system views
- safe support for personal views only if the API shape is stable
- normalized XML summaries by default

### Repo Shape

- `src/queries/form-queries.ts`
- `src/queries/view-queries.ts`
- `src/tools/forms/*`
- `src/tools/views/*`

### Why Second

- completes the story for solution inventory
- useful for UI review and drift analysis

## Milestone 3: Modern Automation And APIs

Status: Done

### Goal

Cover missing parts used in modern Dataverse systems.

### Tools

- `list_custom_apis`
- `get_custom_api_details`
- `list_cloud_flows`
- `get_flow_details`
- `compare_custom_apis`

### Scope

- Custom API definitions
- request and response parameters
- cloud flow metadata when it is available through Dataverse tables
- metadata only, not execution

### Why Third

- closes the gap between classic workflows and modern Power Platform work
- helps teams working with newer patterns

## Milestone 4: Security And Impact Analysis

### Goal

Make the MCP more useful for production support and release checks.

### Tools

- `list_security_roles`
- `get_role_privileges`
- `compare_security_roles`
- `find_table_usage`
- `find_column_usage`
- `find_web_resource_usage`
- `environment_health_report`

### Scope

- role and privilege diff
- usage lookup
- release risk summary
- drift summary
- disabled plugin steps
- draft workflows
- missing components

### Why Fourth

- high practical value
- depends on broader metadata coverage from earlier milestones

## Cross-Cutting Work

Two internal improvements should happen before or during Milestone 1.

### 1. Generic Solution Component Registry

Today, unsupported components are mostly shown as "other" items. Replace this with a registry-based model so new component types can be added without rewriting solution logic each time.

### 2. Reusable Compare Helpers

Create shared helpers for metadata objects that have:

- a stable identity
- normalized compare fields
- readable drift output

This will reduce duplicate logic in future compare tools.

## Delivery Order

Build and ship in this order:

1. table read tools
2. table compare
3. form and view read tools
4. form and view compare
5. Custom APIs
6. security roles
7. usage analysis
8. environment health report

## Definition Of Done

Each milestone should include:

- query builders
- MCP tools
- tests
- README updates
- at least one comparison tool where the area supports drift analysis

## Recommended First Build

Milestone 1 is complete.

If only one next area can be built now, table metadata gives the best value and fits the current project design best.
