# Roadmap

This file lists the next milestones for the Dynamics 365 MCP server.

## Milestone 1: Add One Generic Discovery Tool

Goal:
Add one tool that helps users find the right metadata object before they use a specific tool.

Why this matters:
- The MCP has many focused tools
- Users often know only part of a name
- A model needs a safe first step before it calls a more specific tool

Proposed tool:
- `find_metadata`

Main scope:
- Search across tables, columns, forms, views, workflows, actions, cloud flows, plugin assemblies, plugin classes, web resources, solutions, and custom APIs
- Support one text query with optional environment and optional component type filter
- Return both exact and partial matches
- Rank exact name matches before partial matches

Inputs:
- `environment`
- `query`
- `componentType` optional
- `limit` optional

Output:
- Component type
- Main display name
- Unique name or logical name if available
- Solution if available
- Main ID if available
- Short reason why the item matched
- Suggested next tools

Delivery steps:
- Add one shared search layer for common component types
- Add one MCP tool on top of that layer
- Add tests for ranking, ambiguity, and empty results
- Add manual prompt examples

Done when:
- A user can start with one search tool for most metadata tasks
- The result gives enough context to choose the next tool
- Tests cover exact match, partial match, type filter, and no match cases

Expected result:
- Search across major component types from one place
- Return clear matches with type, name, solution, ID, and suggested next tools
- Reduce trial and error in chat

## Milestone 2: Expose ALM Objects As First-Class Tools

Goal:
Add direct MCP tools for ALM objects that are already used in internal logic.

Why this matters:
- These objects are important in solution work
- The code already reads some of them for reports and inventory
- Users should not need to use a health report just to inspect one ALM object

Main scope:
- Environment variables
- Connection references
- App modules
- Dashboards

Proposed tools:
- `list_environment_variables`
- `get_environment_variable_details`
- `list_connection_references`
- `get_connection_reference_details`
- `list_app_modules`
- `get_app_module_details`
- `list_dashboards`
- `get_dashboard_details`

Common behavior:
- Support `environment`
- Support optional `solution`
- Support optional name filter
- Return stable structured content like the current tools

Important details:
- Show both definition and current value for environment variables when possible
- Show connector, connection status, and missing connection links for connection references
- Show app name, unique name, state, and managed state for app modules
- Show dashboard type, table, and managed state for dashboards

Delivery steps:
- Reuse current query helpers where possible
- Add missing query helpers only when needed
- Keep the same response envelope used by other tools
- Add contract tests and at least one integration-style test per new tool group
- Add prompt examples and README updates

Done when:
- ALM objects can be listed and inspected without using indirect tools
- Solution filters work in the same way as other metadata tools
- Outputs are easy to compare across environments later

Expected result:
- Add tools for environment variables
- Add tools for connection references
- Add tools for app modules
- Add tools for dashboards if supported by current queries

## Milestone 3: Harden HTTP Mode For Real Service Use

Goal:
Make HTTP mode stronger for long-running service use.

Why this matters:
- HTTP mode should work well as a stable local or team service
- Per-request setup is simple, but it can become a weak point under higher load
- Better session handling will make future MCP features easier to support

Main scope:
- Server lifecycle
- Session lifecycle
- Request cleanup
- Error handling
- Health reporting

Focus areas:
- Review if one MCP server instance should live for the process
- Review if one transport should live per session instead of per request
- Make cleanup safe on client disconnects and server shutdown
- Avoid leaking active request counts or transport state
- Keep logs useful for debugging HTTP issues

Delivery steps:
- Document the current HTTP request flow
- Define the target lifecycle for server, session, and transport
- Refactor HTTP mode to match that lifecycle
- Add tests for repeated requests, concurrent requests, disconnects, and shutdown
- Extend the health endpoint only with fields that help operations

Done when:
- Repeated HTTP calls work without creating hidden state problems
- Session behavior is clear and tested
- Shutdown is clean
- The health endpoint reflects real service state

Expected result:
- Improve request lifecycle handling
- Improve session handling
- Reduce risk from per-request server setup
- Keep health and error behavior clear

## Milestone 4: Replace Secret Storage With OS Keychain

Goal:
Fully replace the current token file storage with OS keychain storage.

Expected result:
- Stop storing auth secrets in the current JSON token cache
- Use OS keychain as the only secret storage
- Keep sign-in flow simple for users
- Do not add migration behavior from the old storage

## Milestone 5: Add MCP Prompts And Resources

Goal:
Add prompts and resources to make the MCP easier to use from clients.

Expected result:
- Add prompts for common Dynamics 365 tasks
- Add resources for reusable context
- Improve first-run experience for users and agents
- Guide users to the right tools faster
