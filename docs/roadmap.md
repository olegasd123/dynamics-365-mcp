# Dynamics 365 MCP Roadmap

This roadmap turns the main improvement ideas into clear milestones.

## Goals

- Make the MCP easier for AI agents to use
- Cover more real Dynamics 365 / Dataverse ALM work
- Improve speed and stability on large environments
- Add stronger tests for startup and transport flows

## Milestone 1: Agent-Friendly Output [Done]

### Goal

Make tool results easier to reuse in other prompts and agent flows.

Status: completed on 2026-04-06

### Scope

- Add structured JSON output for key tools
- Keep text output for human reading
- Use a stable response shape for list, details, usage, and compare tools
- Add shared response helpers to reduce repeated formatting code

### Main Features

- Return text plus `structuredContent` by default on core tools
- Standard top-level fields: `version`, `tool`, `ok`, `summary`, and `data` / `error`
- Shared formatter / serializer utilities
- README notes for structured output

### Exit Criteria

- Core metadata tools support structured output
- Core compare tools support structured output
- Tool responses are consistent across modules
- Tests cover output shape for at least one tool in each main area

## Milestone 2: Broader ALM Coverage

### Goal

Cover more solution components that matter in real delivery and release work.

### Scope

- Extend solution-aware inventory
- Add missing high-value component types
- Improve dependency and health reporting with the new components

### Main Features

- Add support for tables and columns in solution inventory
- Add support for environment variables and connection references
- Add support for app modules and dashboards
- Add support for security artifacts where possible
- Show these components in solution details and dependency reports

### Exit Criteria

- `get_solution_details` includes the new component groups
- `get_solution_dependencies` can resolve supported links for the new groups
- Health reports include new risk checks where relevant
- README documents supported solution component coverage

## Milestone 3: Scale And Performance

### Goal

Keep the MCP fast on large Dataverse environments.

### Scope

- Reduce full-environment fetches
- Push more filtering to Dataverse queries
- Add safe caching for repeated metadata reads

### Main Features

- Replace broad fetch-and-filter paths with targeted ID queries
- Add chunked query helpers for large ID sets
- Add short-lived in-memory cache by environment and query key
- Add limits and warnings for expensive compare and usage operations
- Improve comparison code paths for large datasets

### Exit Criteria

- Solution inventory no longer depends on full entity-set scans for main components
- Large compare flows use targeted queries where possible
- Repeated calls in one session are faster because of cache hits
- Benchmark notes or test fixtures show measurable improvement

## Milestone 4: Auth And Runtime Hardening

### Goal

Reduce failures in long-running or repeated use.

### Scope

- Improve token handling
- Improve retry behavior for transient failures
- Make HTTP mode more production-ready

### Main Features

- Persist device code tokens between restarts if the auth flow allows it
- Refresh and retry once on `401` responses
- Retry selected transient `5xx` and network errors with backoff
- Add better timeout and request error messages
- Add more HTTP service health details

### Exit Criteria

- Restart does not force a new sign-in in the common supported device-code flow
- Temporary API issues recover without user action in common cases
- Error messages clearly show environment and failure type
- HTTP mode has a documented and tested health contract

## Milestone 5: Transport And Contract Testing

### Goal

Test the full runtime, not only isolated helper logic.

### Scope

- Add startup tests for `stdio` and HTTP mode
- Add contract tests for tool schemas and key responses
- Protect against regressions in registration and transport code

### Main Features

- Tests for runtime option parsing
- HTTP smoke tests for `/health` and `/mcp`
- `stdio` startup smoke test
- Contract tests for tool names, input schema basics, and output shape

### Exit Criteria

- `src/index.ts` startup paths are covered by tests
- HTTP mode is tested end to end
- Tool contract regressions fail CI
- Docs show how to run the new test groups

## Milestone 6: Impact Analysis

### Goal

Help users answer "what will break if I change this?".

### Scope

- Add cross-component impact analysis
- Reuse usage and dependency data
- Return both summary and detailed results

### Main Features

- New impact tool for table, column, plugin, workflow, flow, web resource, or solution
- Result sections for forms, views, plugin steps, workflows, flows, and dependencies
- Risk summary with counts and likely affected areas
- Optional environment-to-environment impact compare later

### Exit Criteria

- A user can ask for impact of one component and get one clear report
- The report reuses existing usage and dependency logic where possible
- Tests cover at least table, column, and plugin impact cases

## Suggested Delivery Order

1. Milestone 1: Agent-Friendly Output
2. Milestone 2: Broader ALM Coverage
3. Milestone 3: Scale And Performance
4. Milestone 4: Auth And Runtime Hardening
5. Milestone 5: Transport And Contract Testing
6. Milestone 6: Impact Analysis

## Notes

- Milestone 1 should come first because it improves almost every future tool.
- Milestone 2 and Milestone 3 can overlap, but performance work should start early for new solution coverage.
- Milestone 5 should run in parallel with Milestone 4 where possible.
- Milestone 6 is best after the broader metadata coverage is ready.
