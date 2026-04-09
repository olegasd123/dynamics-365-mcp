# HTTP Lifecycle

## Flow

- One process keeps shared config, auth, and Dynamics client state
- One HTTP session gets one MCP server instance
- One HTTP session gets one Streamable HTTP transport
- `POST /mcp` without `Mcp-Session-Id` can create a new session during initialize
- The runtime can reject new sessions when the active session limit is reached
- `POST /mcp`, `GET /mcp`, and `DELETE /mcp` with `Mcp-Session-Id` reuse the same session
- Idle sessions are closed automatically after the configured timeout
- A cleanup loop removes expired sessions on a fixed interval
- `DELETE /mcp` closes the session and removes it from the runtime store
- Shutdown closes all active sessions before the HTTP server exits

## Health Data

The health endpoint now includes:

- request totals
- active request count
- error counters
- active session count
- pending session count
- session limit and idle timeout settings
- expired, evicted, and rejected session counters
- oldest session age and longest idle time
- shutdown state

## Test Coverage

The runtime tests now check:

- repeated HTTP calls in one session
- concurrent sessions
- idle session timeout cleanup
- active session limit rejection
- disconnect cleanup for active HTTP streams
- clean shutdown with active sessions
