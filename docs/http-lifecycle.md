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

- service info like version, host, port, path, pid, and uptime
- configured environment names and environment count
- request totals
- active request count
- error counters
- last error message and time
- active session count
- pending session count
- session limit, idle timeout, and cleanup interval settings
- expired, evicted, and rejected session counters
- oldest session age, longest idle time, and last expiry time
- shutdown state
- auth cache state
- Dataverse client cache state

## Test Coverage

The runtime tests now check:

- repeated HTTP calls in one session
- concurrent sessions
- idle session timeout cleanup
- active session limit rejection
- disconnect cleanup for active HTTP streams
- clean shutdown with active sessions
