# HTTP Lifecycle

## Flow

- One process keeps shared config, auth, and Dynamics client state
- One HTTP session gets one MCP server instance
- One HTTP session gets one Streamable HTTP transport
- `POST /mcp` without `Mcp-Session-Id` can create a new session during initialize
- `POST /mcp`, `GET /mcp`, and `DELETE /mcp` with `Mcp-Session-Id` reuse the same session
- `DELETE /mcp` closes the session and removes it from the runtime store
- Shutdown closes all active sessions before the HTTP server exits

## Health Data

The health endpoint now includes:

- request totals
- active request count
- error counters
- active session count
- shutdown state

## Test Coverage

The runtime tests now check:

- repeated HTTP calls in one session
- concurrent sessions
- disconnect cleanup for active HTTP streams
- clean shutdown with active sessions
