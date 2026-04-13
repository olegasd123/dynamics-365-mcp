# Manual Tool Test Prompts

This file gives one prompt for each CRM tool in this MCP server.

Use these prompts when you want to test the tools by hand from an MCP client or chat UI.

Note:

- This file is about manual chat prompts that call tools.
- The server also publishes MCP prompts and resources for first-run guidance.

## Built-in MCP Prompt Examples

Use these when your MCP client supports prompt picks.

Required notes below do not repeat environment placeholders.

- `discover_metadata`
  `Run the built-in prompt discover_metadata for environment <ENV> and query <QUERY>. Keep the answer short and use the best follow-up detail tool.`
  `(Required: <QUERY>)`

- `review_solution`
  `Run the built-in prompt review_solution for environment <ENV> and solution <SOLUTION>. Focus on dependencies.`
  `(Required: <SOLUTION>)`

- `compare_solution`
  `Run the built-in prompt compare_solution between <SOURCE_ENV> and <TARGET_ENV> for solution <SOLUTION>.`
  `(Required: <SOLUTION>)`

- `investigate_table_change`
  `Run the built-in prompt investigate_table_change for environment <ENV>, table <TABLE>, and column <COLUMN>.`
  `(Required: <TABLE>)`

- `release_gate_check`
  `Run the built-in prompt release_gate_check for environment <ENV> and solution <SOLUTION>. Compare with <TARGET_ENV> if needed.`
  `(Required: none)`

- `investigate_plugin_failure`
  `Run the built-in prompt investigate_plugin_failure for environment <ENV>, plugin class <PLUGIN_CLASS>, assembly <PLUGIN>, and symptom 'step does not fire on update'.`
  `(Required: none)`

- `review_security_role`
  `Run the built-in prompt review_security_role for environment <ENV>, role <ROLE>, and business unit <BUSINESS_UNIT>.`
  `(Required: <ROLE>)`

- `analyze_environment_drift`
  `Run the built-in prompt analyze_environment_drift with baseline <SOURCE_ENV>, targets <TARGET_ENVS>, and component type plugins.`
  `(Required: none)`

- `trace_flow_dependency`
  `Run the built-in prompt trace_flow_dependency for environment <ENV>, flow <FLOW>, and solution <SOLUTION>.`
  `(Required: <FLOW>)`

## Built-in MCP Resource Examples

Read these resources when you want fixed guidance before you call a tool.

- `d365://guides/getting-started`
- `d365://reference/environments`
- `d365://reference/prompts`
- `d365://reference/tool-groups`
- `d365://reference/task-routing`
- `d365://reference/release-checklist`
- `d365://reference/plugin-troubleshooting`
- `d365://environments/<ENV>/starter`

## Placeholders

Replace these values before you run a prompt:

- `<ENV>`: one environment name like `dev`
- `<SOURCE_ENV>`: source environment name like `dev`
- `<TARGET_ENV>`: target environment name like `test`
- `<TARGET_ENVS>`: list of target environments like `test, prod`
- `<SOLUTION>`: solution display name or unique name
- `<TARGET_SOLUTION>`: target solution display name or unique name
- `<QUERY>`: search text like `account` or `sync`
- `<TABLE>`: table logical name like `account`
- `<TARGET_TABLE>`: target table name if it is different
- `<COLUMN>`: column logical name like `name`
- `<COLUMNS>`: comma-separated column logical names like `name, accountnumber`
- `<PLUGIN>`: plugin assembly name
- `<PLUGIN_CLASS>`: plugin class name or full type name
- `<STEP>`: plugin step name
- `<WORKFLOW>`: workflow display name
- `<WORKFLOW_UNIQUE_NAME>`: workflow unique name
- `<FORM>`: form display name or unique name
- `<VIEW>`: view name
- `<BUTTON>`: ribbon button label, id, or command name
- `<API>`: Custom API name or unique name
- `<FLOW>`: cloud flow display name or unique name
- `<ROLE>`: security role name
- `<BUSINESS_UNIT>`: business unit name
- `<WEB_RESOURCE>`: web resource name like `new_/scripts/main.js`
- `<ENV_VAR>`: environment variable schema name or display name
- `<CONNECTION_REFERENCE>`: connection reference display name or logical name
- `<APP_MODULE>`: app module name or unique name
- `<DASHBOARD>`: dashboard name

Tip:

- Start with the `list_*` prompt in a group.
- Then use one returned name in the related `get_*`, `find_*`, or `compare_*` prompt.
- In plugin prompts, `<PLUGIN>` means plugin assembly. Use `<PLUGIN_CLASS>` for one `IPlugin` class. If you say "plugin type", it still means the class, not the assembly.

## Plugins

Plugin tools return plugin classes only. Workflow activities (`CodeActivity`) stay under workflow terminology. Use the assembly detail tool when you need to inspect both plugin classes and workflow activities in one DLL.

- `list_plugins`
  `In <ENV>, list plugin classes from solution <SOLUTION>. Show only orphaned plugin classes with no registered steps. Include assembly names.`
  `(Required: none)`

- `list_plugin_steps`
  `In <ENV>, list all registered steps for plugin class <PLUGIN_CLASS>. If needed, narrow the match to assembly <PLUGIN>.`
  `(Required: <PLUGIN_CLASS>)`

- `get_plugin_details`
  `In <ENV>, show full details for plugin class <PLUGIN_CLASS>. Include the assembly name, registered steps, and images.`
  `(Required: <PLUGIN_CLASS>)`

- `list_plugin_assemblies`
  `In <ENV>, list plugin assemblies for solution <SOLUTION>. Show only orphaned assemblies with no registered steps.`
  `(Required: none)`

- `list_plugin_assembly_steps`
  `In <ENV>, list all registered steps for the plugin assembly <PLUGIN>.`
  `(Required: <PLUGIN>)`

- `list_plugin_assembly_images`
  `In <ENV>, list plugin images for the plugin assembly <PLUGIN>. Filter to step <STEP> and message Update if possible.`
  `(Required: <PLUGIN>)`

- `get_plugin_assembly_details`
  `In <ENV>, show full details for the plugin assembly <PLUGIN>, and keep plugin classes and workflow activities in separate sections. Include steps and images.`
  `(Required: <PLUGIN>)`

## Workflows And Actions

- `list_workflows`
  `In <ENV>, list activated business rules from solution <SOLUTION>.`
  `In <ENV>, list activated workflows from solution <SOLUTION>.`
  `In <ENV>, list BPFs from solution <SOLUTION>.`
  `In <ENV>, list modern flows from solution <SOLUTION>.`
  `In <ENV>, list dialogs from solution <SOLUTION>.`
  `(Required: none)`

- `list_actions`
  `In <ENV>, list custom actions from solution <SOLUTION>.`
  `(Required: none)`

- `get_workflow_details`
  `In <ENV>, show full details for workflow <WORKFLOW>. If needed, use the unique name <WORKFLOW_UNIQUE_NAME>.`
  `(Required: none)`

## Web Resources

- `list_web_resources`
  `In <ENV>, list JavaScript web resources from solution <SOLUTION> with names that contain 'account'.`
  `(Required: none)`

- `get_web_resource_content`
  `In <ENV>, get the content of web resource <WEB_RESOURCE>.`
  `(Required: <WEB_RESOURCE>)`

## ALM Objects

- `list_environment_variables`
  `In <ENV>, list environment variables from solution <SOLUTION> where the schema name matches 'contoso'. Show current values when available.`
  `(Required: none)`

- `get_environment_variable_details`
  `In <ENV>, show full details for environment variable <ENV_VAR> from solution <SOLUTION>. Include default value and current value records.`
  `(Required: <ENV_VAR>)`

- `list_connection_references`
  `In <ENV>, list connection references from solution <SOLUTION> that match 'office'. Show connector and connection status.`
  `(Required: none)`

- `get_connection_reference_details`
  `In <ENV>, show full details for connection reference <CONNECTION_REFERENCE> from solution <SOLUTION>. Include connector id, connection id, and missing link status.`
  `(Required: <CONNECTION_REFERENCE>)`

- `list_app_modules`
  `In <ENV>, list app modules from solution <SOLUTION> that match 'Sales'.`
  `(Required: none)`

- `get_app_module_details`
  `In <ENV>, show full details for app module <APP_MODULE> from solution <SOLUTION>.`
  `(Required: <APP_MODULE>)`

- `list_dashboards`
  `In <ENV>, list dashboards from solution <SOLUTION> that match 'Sales'.`
  `(Required: none)`

- `get_dashboard_details`
  `In <ENV>, show full details for dashboard <DASHBOARD> from solution <SOLUTION>.`
  `(Required: <DASHBOARD>)`

## Solutions

- `list_solutions`
  `In <ENV>, list solutions with names that contain 'Core'.`
  `(Required: none)`

- `get_solution_details`
  `In <ENV>, show full details for solution <SOLUTION>, including supported components.`
  `(Required: <SOLUTION>)`

- `get_solution_dependencies`
  `In <ENV>, show both required and dependent links for solution <SOLUTION>. Limit the result to component type web_resource and component name <WEB_RESOURCE>.`
  `(Required: <SOLUTION>)`

## Tables

- `find_metadata`
  `In <ENV>, find metadata that matches <QUERY>.`
  `In <ENV>, find only cloud flow metadata that matches <QUERY>.`
  `(Required: <QUERY>)`

- `list_tables`
  `In <ENV>, list tables from solution <SOLUTION> where the name matches 'account'.`
  `(Required: none)`

- `get_table_schema`
  `In <ENV>, show the full schema for table <TABLE> from solution <SOLUTION>. Include columns, keys, and relationships.`
  `(Required: <TABLE>)`

- `list_table_columns`
  `In <ENV>, list columns for table <TABLE> from solution <SOLUTION>.`
  `(Required: <TABLE>)`

- `list_table_relationships`
  `In <ENV>, list relationships for table <TABLE> from solution <SOLUTION>.`
  `(Required: <TABLE>)`

## Forms

- `list_forms`
  `In <ENV>, list main forms for table <TABLE> from solution <SOLUTION>.`
  `(Required: none)`

- `get_form_details`
  `In <ENV>, show details for form <FORM> on table <TABLE> from solution <SOLUTION>.`
  `(Required: <FORM>)`

## Ribbons

- `list_table_ribbons`
  `In <ENV>, list ribbons for table <TABLE>. Group the result by ribbon location and include the buttons on each ribbon. If needed, limit the result to location homepageGrid.`
  `(Required: <TABLE>)`

- `get_ribbon_button_details`
  `In <ENV>, show ribbon button details for <BUTTON> on table <TABLE>. Include the command, enable rules, display rules, and image metadata. If needed, limit the search to location form.`
  `(Required: <TABLE>, <BUTTON>)`

## Views

- `list_views`
  `In <ENV>, list system views for table <TABLE> from solution <SOLUTION> with names that contain 'Active'.`
  `(Required: none)`

- `get_view_details`
  `In <ENV>, show details for the system view <VIEW> on table <TABLE> from solution <SOLUTION>.`
  `(Required: <VIEW>)`

- `get_view_fetchxml`
  `In <ENV>, return the normalized FetchXML for the system view <VIEW> on table <TABLE> from solution <SOLUTION>.`
  `(Required: <VIEW>)`

## Custom APIs

- `list_custom_apis`
  `In <ENV>, list Custom APIs with names that contain 'contoso'.`
  `(Required: none)`

- `get_custom_api_details`
  `In <ENV>, show full details for Custom API <API>, including request and response metadata.`
  `(Required: <API>)`

## Cloud Flows

- `list_cloud_flows`
  `In <ENV>, list activated cloud flows from solution <SOLUTION> with names that contain 'sync'.`
  `(Required: none)`

- `get_flow_details`
  `In <ENV>, show full details for cloud flow <FLOW> from solution <SOLUTION>. Include triggers, actions, and connections.`
  `(Required: <FLOW>)`

## Security

- `list_business_units`
  `In <ENV>, list business units with names that contain 'Sales'.`
  `(Required: none)`

- `get_business_units_details`
  `In <ENV>, show business unit details for <BUSINESS_UNIT>. Include parent and child business units when they exist.`
  `(Required: <BUSINESS_UNIT>)`

- `list_security_roles`
  `In <ENV>, list security roles with names that contain 'Sales'. If needed, use business unit <BUSINESS_UNIT>. Otherwise use the default global business unit.`
  `(Required: none)`

- `get_role_privileges`
  `In <ENV>, show privileges for security role <ROLE>. If needed, use business unit <BUSINESS_UNIT>. Otherwise use the default global business unit.`
  `(Required: <ROLE>)`

## Usage And Impact

- `find_table_usage`
  `In <ENV>, find where table <TABLE> is used across metadata assets.`
  `(Required: <TABLE>)`

- `find_column_usage`
  `In <ENV>, find where column <COLUMN> from table <TABLE> is used across metadata assets.`
  `(Required: <COLUMN>)`

- `find_web_resource_usage`
  `In <ENV>, find where web resource <WEB_RESOURCE> is used in forms and other text web resources.`
  `(Required: <WEB_RESOURCE>)`

- `analyze_create_triggers`
  `In <ENV>, analyze what direct triggers can run when table <TABLE> is created with columns <COLUMNS>. Keep direct triggers separate from related cloud flow references.`
  `(Required: <TABLE>)`

- `analyze_update_triggers`
  `In <ENV>, analyze what direct triggers can run when table <TABLE> is updated with columns <COLUMNS>. Keep direct triggers separate from related cloud flow references.`
  `(Required: <TABLE>, <COLUMNS>)`

- `analyze_impact`
  `In <ENV>, analyze impact for column <TABLE>.<COLUMN> and include up to 50 dependency rows.`
  `(Required: <TABLE>.<COLUMN>)`

## Health

- `environment_health_report`
  `Build an environment health report for <ENV> and focus on solution <SOLUTION>.`
  `(Required: none)`

- `release_gate_report`
  `In <ENV>, build a release gate report for solution <SOLUTION>. Compare with <TARGET_ENV> when you want drift in the same report, and use strict mode for a no-warning gate.`
  `(Required: <SOLUTION>)`

## Cross-Environment Comparison

This group needs at least two configured environments.

- `compare_plugin_assemblies`
  `Compare plugin assembly <PLUGIN> between <SOURCE_ENV> and <TARGET_ENV>. Include step and image differences.`
  `(Required: none)`

- `compare_solutions`
  `Compare solution <SOLUTION> in <SOURCE_ENV> with solution <TARGET_SOLUTION> in <TARGET_ENV>.`
  `(Required: <SOLUTION>)`

- `compare_workflows`
  `Compare activated workflows named <WORKFLOW> between <SOURCE_ENV> and <TARGET_ENV>.`
  `(Required: none)`

- `compare_web_resources`
  `Compare JavaScript web resources with names that contain 'account' between <SOURCE_ENV> and <TARGET_ENV>, and compare content too.`
  `(Required: none)`

- `compare_environment_matrix`
  `Use <SOURCE_ENV> as the baseline and compare it with <TARGET_ENVS>. Include plugin assemblies, workflows, and web resources, and compare web resource content hashes too.`
  `(Required: none)`

- `compare_table_schema`
  `Compare table <TABLE> in <SOURCE_ENV> with table <TARGET_TABLE> in <TARGET_ENV>.`
  `(Required: <TABLE>)`

- `compare_forms`
  `Compare main forms for table <TABLE> between <SOURCE_ENV> and <TARGET_ENV>. Limit the check to form name <FORM>.`
  `(Required: none)`

- `compare_views`
  `Compare system views for table <TABLE> between <SOURCE_ENV> and <TARGET_ENV>. Limit the check to view <VIEW>.`
  `(Required: none)`

- `compare_custom_apis`
  `Compare Custom API <API> between <SOURCE_ENV> and <TARGET_ENV>.`
  `(Required: none)`

- `compare_security_roles`
  `Compare security role <ROLE> between <SOURCE_ENV> and <TARGET_ENV>. Use business unit <BUSINESS_UNIT> in both environments if needed. Otherwise use each environment's default global business unit.`
  `(Required: <ROLE>)`

## Full Coverage Checklist

This prompt list covers these tools:

- `analyze_impact`
- `analyze_create_triggers`
- `analyze_update_triggers`
- `compare_custom_apis`
- `compare_environment_matrix`
- `compare_forms`
- `compare_plugin_assemblies`
- `compare_security_roles`
- `compare_solutions`
- `compare_table_schema`
- `compare_views`
- `compare_web_resources`
- `compare_workflows`
- `environment_health_report`
- `find_column_usage`
- `find_table_usage`
- `find_metadata`
- `find_web_resource_usage`
- `get_app_module_details`
- `get_business_units_details`
- `get_connection_reference_details`
- `get_custom_api_details`
- `get_dashboard_details`
- `get_environment_variable_details`
- `get_flow_details`
- `get_form_details`
- `get_plugin_details`
- `get_plugin_assembly_details`
- `get_ribbon_button_details`
- `get_role_privileges`
- `get_solution_dependencies`
- `get_solution_details`
- `get_table_schema`
- `get_view_details`
- `get_view_fetchxml`
- `get_web_resource_content`
- `get_workflow_details`
- `list_actions`
- `list_app_modules`
- `list_business_units`
- `list_cloud_flows`
- `list_connection_references`
- `list_custom_apis`
- `list_dashboards`
- `list_environment_variables`
- `list_forms`
- `list_table_ribbons`
- `list_plugin_steps`
- `list_plugins`
- `list_plugin_assembly_images`
- `list_plugin_assembly_steps`
- `list_plugin_assemblies`
- `list_security_roles`
- `list_solutions`
- `list_table_columns`
- `list_table_relationships`
- `list_tables`
- `list_views`
- `list_web_resources`
- `list_workflows`
- `release_gate_report`
