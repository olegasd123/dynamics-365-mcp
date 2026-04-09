# Dynamics 365 MCP Roadmap

This roadmap turns the improvement ideas into milestones that are ready to build.

The order is based on value for MCP clients first, then runtime safety, then new high-level workflows.

## Milestone 1: MCP Surface Cleanup [done]

### Goal

Make the MCP surface smaller, cleaner, and easier for clients to use.

### Why First

- It improves tool discovery for every client.
- It removes extra noise from `listTools()`.
- It lowers the risk of clients calling the wrong tool.

### Scope

- Remove public `*commentary` compatibility tool aliases.
- Keep malformed-call handling inside runtime or request parsing.
- Keep canonical tool names only.
- Update tests that now expect duplicate tool names.

### Build Tasks

- Change tool registration so only real tool names are published.
- Add one safe compatibility layer before tool execution if needed.
- Update runtime transport tests.
- Update request logger tests.
- Review logs to make sure tool tracing still works.

### Done When

- `listTools()` returns only canonical tool names.
- No test expects `*commentary` tools.
- Old malformed calls fail with a clear error or are mapped safely before dispatch.
- Logging still shows the real tool name.

### Files To Start With

- `src/logging/request-logger.ts`
- `src/logging/__tests__/request-logger.test.ts`
- `src/__tests__/runtime-transports.test.ts`

## [done] Milestone 2: HTTP Runtime Hardening

### Goal

Make HTTP mode safer for long-running local or team use.

### Scope

- Add idle session timeout.
- Add max active session limit.
- Add cleanup for old sessions.
- Extend `/health` with session runtime details.

### Build Tasks

- Add config for session TTL and max sessions.
- Close sessions that are idle for too long.
- Reject new sessions when the limit is reached.
- Track counts for evicted, rejected, and expired sessions.
- Add tests for timeout and limit behavior.

### Done When

- Idle sessions are removed automatically.
- Health output shows useful session stats.
- The server stays stable under repeated HTTP session creation.
- Tests cover timeout, limit, and shutdown behavior.

### Files To Start With

- `src/http/http-runtime.ts`
- `src/index.ts`
- `src/__tests__/runtime-transports.test.ts`
- `docs/http-lifecycle.md`

## [done] Milestone 3: Tool Output Limits And Paging

### Goal

Make large environments usable without huge responses.

### Scope

- Add `limit` to list-style tools.
- Add truncation metadata in `structuredContent`.
- Add paging support where it makes sense.
- Keep text output short when result sets are large.

### Build Tasks

- Define one shared list response shape.
- Add fields like `limit`, `returnedCount`, `totalCount`, `hasMore`, and `nextCursor` where possible.
- Update the biggest list tools first:
  - `list_tables`
  - `list_views`
  - `list_plugins`
  - `list_solutions`
  - `list_workflows`
  - `list_web_resources`
- Add tests for truncated and paged responses.

### Done When

- Large list tools do not dump full environments by default.
- Clients can detect truncated results from JSON alone.
- Text responses tell users how to narrow or continue the query.
- Response shape stays consistent across list tools.

### Files To Start With

- `src/tools/response.ts`
- `src/tools/tables/list-tables.ts`
- `src/tools/views/list-views.ts`
- `src/tools/plugins/list-plugins.ts`
- `src/tools/solutions/list-solutions.ts`

## Milestone 4: Metadata Manifest And Doc Generation

### Goal

Stop tool drift between code, tests, resources, and docs.

### Scope

- Create one source of truth for tool metadata.
- Generate or validate docs from that source.
- Generate or validate expected tool lists from that source.

### Build Tasks

- Create a manifest for tool names, group, short description, and main params.
- Move repeated metadata out of manual lists.
- Use the manifest in tests for expected tool names.
- Use the manifest in MCP resources like tool groups.
- Add a small script or test that checks README tool docs.
- Fix broken docs references and config error messages.

### Done When

- Tool names are not duplicated in many files by hand.
- README and MCP resource docs stay in sync.
- Missing doc links are caught by tests.
- Startup errors point to real docs.

### Files To Start With

- `src/tools/index.ts`
- `src/tools/__tests__/tool-test-helpers.ts`
- `src/resources/index.ts`
- `README.md`
- `src/config/environments.ts`

## Milestone 5: MCP Guidance And Prompt Expansion

### Goal

Help agents and users choose the right tool path faster.

### Scope

- Add more built-in MCP prompts.
- Add richer MCP resources for task routing.
- Improve first-run guidance by role and task.

### Suggested New Prompts

- `release_gate_check`
- `investigate_plugin_failure`
- `review_security_role`
- `analyze_environment_drift`
- `trace_flow_dependency`

### Suggested New Resources

- `d365://reference/task-routing`
- `d365://reference/release-checklist`
- `d365://reference/plugin-troubleshooting`

### Build Tasks

- Write prompt flows that call the best first tool and one follow-up tool.
- Add resources that map common questions to the right tools.
- Add tests for prompt names, arguments, and resource reads.
- Add examples to docs.

### Done When

- The server gives clear entry points for common Dynamics tasks.
- New prompts cover release, plugins, security, flows, and drift.
- Resources help clients route without guessing.

### Files To Start With

- `src/prompts/index.ts`
- `src/resources/index.ts`
- `src/__tests__/mcp-prompts-resources.integration.test.ts`
- `docs/prompt-examples.md`

## Milestone 6: Release Gate Tool

### Goal

Add one high-value tool that answers: "Is this solution ready to move?"

### Scope

- Create a new tool like `release_gate_report`.
- Reuse current health, dependency, and comparison logic.
- Return one opinionated report with risks, blockers, and next checks.

### Tool Inputs

- `environment`
- `solution`
- `targetEnvironment` optional
- `strict` optional

### Report Areas

- solution summary
- dependency risk
- unmanaged asset count
- disabled plugin steps
- inactive workflows and flows
- missing environment variable values
- risky connection references
- optional drift against target environment

### Build Tasks

- Design one stable JSON output schema.
- Reuse existing inventory and compare helpers.
- Add a clear risk level and blocker list.
- Add a next-actions section with suggested follow-up tools.
- Add unit and integration tests.

### Done When

- One tool gives a useful go/no-go view for a solution.
- The report is short in text and rich in JSON.
- The output links each risk to a next tool when deeper analysis is needed.

### Files To Start With

- `src/tools/health/environment-health-report.ts`
- `src/tools/solutions/get_solution_dependencies.ts`
- `src/tools/comparison/compare-environment-matrix.ts`
- `src/tools/index.ts`

## Suggested Delivery Order

1. Milestone 1: MCP Surface Cleanup
2. Milestone 2: HTTP Runtime Hardening
3. Milestone 3: Tool Output Limits And Paging
4. Milestone 4: Metadata Manifest And Doc Generation
5. Milestone 5: MCP Guidance And Prompt Expansion
6. Milestone 6: Release Gate Tool

## Small Follow-Up Fixes

These can be done with Milestone 4 or earlier:

- add the roadmap link to `README.md`
- fix the missing `docs/performance-notes.md` reference or remove it
- fix the missing `.env.example` reference in startup errors
- add a doc link check in CI
