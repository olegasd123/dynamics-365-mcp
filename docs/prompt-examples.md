# Manual Tool Test Prompts

This file gives one prompt for each CRM tool in this MCP server.

Use these prompts when you want to test the tools by hand from an MCP client or chat UI.

## Placeholders

Replace these values before you run a prompt:

- `<ENV>`: one environment name like `dev`
- `<SOURCE_ENV>`: source environment name like `dev`
- `<TARGET_ENV>`: target environment name like `test`
- `<TARGET_ENVS>`: list of target environments like `test, prod`
- `<SOLUTION>`: solution display name or unique name
- `<TARGET_SOLUTION>`: target solution display name or unique name
- `<TABLE>`: table logical name like `account`
- `<TARGET_TABLE>`: target table name if it is different
- `<COLUMN>`: column logical name like `name`
- `<PLUGIN>`: plugin assembly name
- `<PLUGIN_CLASS>`: plugin class name or full type name
- `<STEP>`: plugin step name
- `<WORKFLOW>`: workflow display name
- `<WORKFLOW_UNIQUE_NAME>`: workflow unique name
- `<FORM>`: form display name or unique name
- `<VIEW>`: view name
- `<API>`: Custom API name or unique name
- `<FLOW>`: cloud flow display name or unique name
- `<ROLE>`: security role name
- `<BUSINESS_UNIT>`: business unit name
- `<WEB_RESOURCE>`: web resource name like `new_/scripts/main.js`

Tip:

- Start with the `list_*` prompt in a group.
- Then use one returned name in the related `get_*`, `find_*`, or `compare_*` prompt.
- In plugin prompts, `<PLUGIN>` means plugin assembly. Use `<PLUGIN_CLASS>` for one `IPlugin` class. If you say "plugin type", it still means the class, not the assembly.

## Plugins

Plugin tools return plugin classes only. Workflow activities (`CodeActivity`) stay under workflow terminology. Use the assembly detail tool when you need to inspect both plugin classes and workflow activities in one DLL.

- `list_plugins`
  `In <ENV>, list plugin classes from solution <SOLUTION>. Show only orphaned plugin classes with no registered steps. Include assembly names.`

- `list_plugin_steps`
  `In <ENV>, list all registered steps for plugin class <PLUGIN_CLASS>. If needed, narrow the match to assembly <PLUGIN>.`

- `get_plugin_details`
  `In <ENV>, show full details for plugin class <PLUGIN_CLASS>. Include the assembly name, registered steps, and images.`

- `list_plugin_assemblies`
  `In <ENV>, list plugin assemblies for solution <SOLUTION>. Show only orphaned assemblies with no registered steps.`

- `list_plugin_assembly_steps`
  `In <ENV>, list all registered steps for the plugin assembly <PLUGIN>.`

- `list_plugin_assembly_images`
  `In <ENV>, list plugin images for the plugin assembly <PLUGIN>. Filter to step <STEP> and message Update if possible.`

- `get_plugin_assembly_details`
  `In <ENV>, show full details for the plugin assembly <PLUGIN>, and keep plugin classes and workflow activities in separate sections. Include steps and images.`

## Workflows And Actions

- `list_workflows`
  `In <ENV>, list activated business rules from solution <SOLUTION>.`
  `In <ENV>, list workflows rules from solution <SOLUTION>.`
  `In <ENV>, list bpfs from solution <SOLUTION>.`
  `In <ENV>, list modern flows from solution <SOLUTION>.`
  `In <ENV>, list dialogs from solution <SOLUTION>.`

- `list_actions`
  `In <ENV>, list custom actions from solution <SOLUTION>.`

- `get_workflow_details`
  `In <ENV>, show full details for workflow <WORKFLOW>. If needed, use the unique name <WORKFLOW_UNIQUE_NAME>.`

## Web Resources

- `list_web_resources`
  `In <ENV>, list JavaScript web resources from solution <SOLUTION> with names that contain 'account'.`

- `get_web_resource_content`
  `In <ENV>, get the content of web resource <WEB_RESOURCE>.`

## Solutions

- `list_solutions`
  `In <ENV>, list solutions with names that contain 'Core'.`

- `get_solution_details`
  `In <ENV>, show full details for solution <SOLUTION>, including supported components.`

- `get_solution_dependencies`
  `In <ENV>, show both required and dependent links for solution <SOLUTION>. Limit the result to component type web_resource and component name <WEB_RESOURCE>.`

## Tables

- `find_metadata`
  `In <ENV>, find metadata that matches 'account'.`
  `In <ENV>, find only cloud flow metadata that matches 'sync'.`

- `list_tables`
  `In <ENV>, list tables from solution <SOLUTION> where the name matches 'account'.`

- `get_table_schema`
  `In <ENV>, show the full schema for table <TABLE> from solution <SOLUTION>. Include columns, keys, and relationships.`

- `list_table_columns`
  `In <ENV>, list columns for table <TABLE> from solution <SOLUTION>.`

- `list_table_relationships`
  `In <ENV>, list relationships for table <TABLE> from solution <SOLUTION>.`

## Forms

- `list_forms`
  `In <ENV>, list main forms for table <TABLE> from solution <SOLUTION>.`

- `get_form_details`
  `In <ENV>, show details for form <FORM> on table <TABLE> from solution <SOLUTION>.`

## Views

- `list_views`
  `In <ENV>, list system views for table <TABLE> from solution <SOLUTION> with names that contain 'Active'.`

- `get_view_details`
  `In <ENV>, show details for the system view <VIEW> on table <TABLE> from solution <SOLUTION>.`

- `get_view_fetchxml`
  `In <ENV>, return the normalized FetchXML for the system view <VIEW> on table <TABLE> from solution <SOLUTION>.`

## Custom APIs

- `list_custom_apis`
  `In <ENV>, list Custom APIs with names that contain 'contoso'.`

- `get_custom_api_details`
  `In <ENV>, show full details for Custom API <API>, including request and response metadata.`

## Cloud Flows

- `list_cloud_flows`
  `In <ENV>, list activated cloud flows from solution <SOLUTION> with names that contain 'sync'.`

- `get_flow_details`
  `In <ENV>, show full details for cloud flow <FLOW> from solution <SOLUTION>. Include triggers, actions, and connections.`

## Security

- `list_security_roles`
  `In <ENV>, list security roles with names that contain 'Sales'.`

- `get_role_privileges`
  `In <ENV>, show privileges for security role <ROLE> in business unit <BUSINESS_UNIT>.`

## Usage And Impact

- `find_table_usage`
  `In <ENV>, find where table <TABLE> is used across metadata assets.`

- `find_column_usage`
  `In <ENV>, find where column <COLUMN> from table <TABLE> is used across metadata assets.`

- `find_web_resource_usage`
  `In <ENV>, find where web resource <WEB_RESOURCE> is used in forms and other text web resources.`

- `analyze_create_triggers`
  `In <ENV>, analyze what direct triggers can run when table <TABLE> is created with columns <COLUMNS>. Keep direct triggers separate from related cloud flow references.`

- `analyze_update_triggers`
  `In <ENV>, analyze what direct triggers can run when table <TABLE> is updated with columns <COLUMNS>. Keep direct triggers separate from related cloud flow references.`

- `analyze_impact`
  `In <ENV>, analyze impact for column <TABLE>.<COLUMN> and include up to 50 dependency rows.`

## Health

- `environment_health_report`
  `Build an environment health report for <ENV> and focus on solution <SOLUTION>.`

## Cross-Environment Comparison

This group needs at least two configured environments.

- `compare_plugin_assemblies`
  `Compare plugin assembly <PLUGIN> between <SOURCE_ENV> and <TARGET_ENV>. Include step and image differences.`

- `compare_solutions`
  `Compare solution <SOLUTION> in <SOURCE_ENV> with solution <TARGET_SOLUTION> in <TARGET_ENV>.`

- `compare_workflows`
  `Compare activated workflows named <WORKFLOW> between <SOURCE_ENV> and <TARGET_ENV>.`

- `compare_web_resources`
  `Compare JavaScript web resources with names that contain 'account' between <SOURCE_ENV> and <TARGET_ENV>, and compare content too.`

- `compare_environment_matrix`
  `Use <SOURCE_ENV> as the baseline and compare it with <TARGET_ENVS>. Include plugin assemblies, workflows, and web resources, and compare web resource content hashes too.`

- `compare_table_schema`
  `Compare table <TABLE> in <SOURCE_ENV> with table <TARGET_TABLE> in <TARGET_ENV>.`

- `compare_forms`
  `Compare main forms for table <TABLE> between <SOURCE_ENV> and <TARGET_ENV>. Limit the check to form name <FORM>.`

- `compare_views`
  `Compare system views for table <TABLE> between <SOURCE_ENV> and <TARGET_ENV>. Limit the check to view <VIEW>.`

- `compare_custom_apis`
  `Compare Custom API <API> between <SOURCE_ENV> and <TARGET_ENV>.`

- `compare_security_roles`
  `Compare security role <ROLE> between <SOURCE_ENV> and <TARGET_ENV>. Use business unit <BUSINESS_UNIT> in both environments if needed.`

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
- `get_custom_api_details`
- `get_flow_details`
- `get_form_details`
- `get_plugin_details`
- `get_plugin_assembly_details`
- `get_role_privileges`
- `get_solution_dependencies`
- `get_solution_details`
- `get_table_schema`
- `get_view_details`
- `get_view_fetchxml`
- `get_web_resource_content`
- `get_workflow_details`
- `list_actions`
- `list_cloud_flows`
- `list_custom_apis`
- `list_forms`
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
