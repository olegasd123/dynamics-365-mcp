# Live Smoke Tests

Use live smoke tests after large changes or after you add new tool logic.

Do not run them on each code change.

## Goal

The live suite calls every MCP tool with fixed tool arguments.

It does not use chat prompts.

This makes the test stable and shows the real CRM requests behind each tool.

## Local Files

Keep secrets in your normal Dynamics config:

- `D365_MCP_CONFIG`
- `D365_CONNECTION_STRINGS`
- `D365_CONNECTION_STRING`

Keep real tool names and object names in a local file:

- `live-fixtures.json`

This file is ignored by git.

Start from:

- `live-fixtures.example.json`

The file is tool-first:

- optional `execution.maxParallel` sets how many cases can run at the same time
- optional `execution.maxLoggedRequests` sets how many CRM requests to show for one failed case
- optional `execution.maxLoggedRequestChars` sets how long one logged CRM request line can be
- `tools.<toolName>` is an array of test cases for one tool
- each case has `arguments` with real tool input
- one tool can have several cases with different data
- set `enabled` to `false` to disable one case
- use `name` to make logs easy to read
- use `skipReason` when one detail tool has no real object in the environment

## Run

```bash
npm run test:live
```

Optional:

- Set `D365_MCP_LIVE_FIXTURES` when your fixture file is in another path.
- Set `D365_MCP_LIVE_TOOL_TIMEOUT_MS` when one tool needs a longer timeout.
- Set `execution.maxParallel` in `live-fixtures.json` when you want bounded parallel runs.
- Set `execution.maxLoggedRequests` and `execution.maxLoggedRequestChars` when you want shorter or longer failure logs.

If your environment has no Custom APIs or no cloud flows:

- keep the list tool cases
- add `skipReason` to the detail tool case

The detail tool case will be skipped.
The list tool can still run without a name filter.

## What The Suite Does

- builds a real MCP server in memory
- runs configured tool cases with the `execution.maxParallel` limit
- default behavior is one case at a time
- clears the response cache before each tool
- records `query`, `queryPath`, and `getPath` calls
- prints which CRM requests each tool used
- keeps going after tool failures
- skips cases with `skipReason`
- skips cases with `enabled: false`
- prints one full failure list at the end

## Notes

- The suite is opt-in only.
- Normal `npm test` does not run it.
- If one case has bad data, only that case should fail.
- If a shared CRM query is wrong, many tools can fail. This is useful signal.
- If you select a tool with `D365_MCP_LIVE_TOOLS`, that tool must have at least one case in `live-fixtures.json`.
