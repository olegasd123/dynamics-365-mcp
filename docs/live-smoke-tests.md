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

## Run

```bash
npm run test:live
```

Optional:

- Set `D365_MCP_LIVE_FIXTURES` when your fixture file is in another path.
- Set `D365_MCP_LIVE_TOOL_TIMEOUT_MS` when one tool needs a longer timeout.

If your environment has no Custom APIs or no cloud flows:

- set `customApi` to `null`
- set `cloudFlow` to `null`

The detail tools for those objects will be skipped.
The list tools will still run without a name filter.

## What The Suite Does

- builds a real MCP server in memory
- calls every tool one by one
- clears the response cache before each tool
- records `query`, `queryPath`, and `getPath` calls
- prints which CRM requests each tool used
- keeps going after tool failures
- skips detail tools that need objects which do not exist in the environment
- prints one full failure list at the end

## Notes

- The suite is opt-in only.
- Normal `npm test` does not run it.
- If one fixture name is wrong, only that tool should fail.
- If a shared CRM query is wrong, many tools can fail. This is useful signal.
