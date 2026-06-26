## ADDED Requirements

### Requirement: MCP server registration

The Codex plugin SHALL bundle an MCP server at `codex-plugin/memory/memory_tencentdb/mcp-server.ts` that registers two tools: `tdai_memory_search` and `tdai_conversation_search`.

The MCP server SHALL use the `@modelcontextprotocol/sdk` with `StdioServerTransport` for communication with Codex.

The `.mcp.json` config SHALL specify the server command and arguments:
```json
{
  "mcp_servers": {
    "tdai-memory": {
      "command": "npx",
      "args": ["tsx", "${PLUGIN_ROOT}/mcp-server.ts"]
    }
  }
}
```

#### Scenario: MCP server starts with Codex

- **WHEN** Codex launches with the `tencentdb-memory` plugin enabled
- **THEN** the MCP server process starts and connects via stdio transport
- **THEN** two tools (`tdai_memory_search`, `tdai_conversation_search`) are available to the Codex agent

### Requirement: tdai_memory_search tool

The `tdai_memory_search` MCP tool SHALL search structured L1 memories (facts, persona, instructions) using the Gateway's search API.

Parameters:
- `query` (string, **required**): Search query text
- `limit` (number, optional, default: 5, max: 20): Maximum results to return
- `type` (string, optional): Filter by memory type (`persona`, `episodic`, `instruction`)
- `scene` (string, optional): Filter by scene name

The tool SHALL forward the search request to `POST {GATEWAY_URL}/search/memories` and return the `results` field from the Gateway response as tool output text.

The `GATEWAY_URL` SHALL default to `http://127.0.0.1:8420` and be overridable via the `TDAI_GATEWAY_URL` environment variable.

#### Scenario: Agent searches for memories by keyword

- **WHEN** the Codex agent calls `tdai_memory_search` with `{ "query": "user prefers dark mode" }`
- **THEN** the tool forwards `POST /search/memories` to the Gateway and returns matching memory results as text

#### Scenario: Agent searches with type filter

- **WHEN** the Codex agent calls `tdai_memory_search` with `{ "query": "coding style", "type": "instruction" }`
- **THEN** the tool includes `type: "instruction"` in the Gateway request and returns only instruction-type results

#### Scenario: Gateway unavailable

- **WHEN** the Gateway is not running at the configured URL
- **THEN** the tool returns an error message "Memory search unavailable." with `isError: true`

### Requirement: tdai_conversation_search tool

The `tdai_conversation_search` MCP tool SHALL search raw L0 conversation records using the Gateway's conversation search API.

Parameters:
- `query` (string, **required**): Search query text
- `limit` (number, optional, default: 5, max: 20): Maximum results to return
- `session_key` (string, optional): Filter by session

The tool SHALL forward the search request to `POST {GATEWAY_URL}/search/conversations` and return the `results` field from the Gateway response as tool output text.

#### Scenario: Agent searches for past conversation

- **WHEN** the Codex agent calls `tdai_conversation_search` with `{ "query": "database migration discussion" }`
- **THEN** the tool forwards `POST /search/conversations` to the Gateway and returns matching conversation snippets as text

#### Scenario: Gateway unavailable

- **WHEN** the Gateway is not running at the configured URL
- **THEN** the tool returns an error message "Conversation search unavailable." with `isError: true`

### Requirement: Gateway auto-spawn on startup

The MCP server SHALL check Gateway health on startup by calling `GET {GATEWAY_URL}/health`.

If the Gateway is healthy (status `"ok"` or `"degraded"`), the server proceeds directly to MCP registration.

If the Gateway is not healthy and the `MEMORY_TENCENTDB_GATEWAY_CMD` environment variable is set, the server SHALL:
- Spawn the command via `spawn("sh", ["-c", cmd], { detached: true })`
- Poll `GET /health` every 500ms for up to 30 seconds
- Log progress to stderr (MCP servers must not write to stdout)

If the Gateway is not healthy and the environment variable is NOT set, the server SHALL log a warning and proceed with MCP registration. Search tools will return "unavailable" errors at call time.

#### Scenario: Gateway already running

- **WHEN** the MCP server starts and `GET /health` returns `{ "status": "ok" }` within 3 seconds
- **THEN** the server skips auto-spawn and registers tools immediately

#### Scenario: Gateway auto-spawned successfully

- **WHEN** `MEMORY_TENCENTDB_GATEWAY_CMD` is set and the Gateway is not running
- **THEN** the server spawns the Gateway, waits for it to become healthy, then registers tools

#### Scenario: Auto-spawn timeout

- **WHEN** the spawned Gateway does not become healthy within 30 seconds
- **THEN** the server logs a warning and proceeds with MCP registration (tools return errors at call time)

#### Scenario: No auto-spawn configured

- **WHEN** `MEMORY_TENCENTDB_GATEWAY_CMD` is not set and the Gateway is not running
- **THEN** the server logs a warning and proceeds with MCP registration (tools gracefully degrade)

### Requirement: MCP server logging

All MCP server output SHALL be written to stderr (via `console.error`) to avoid corrupting the stdio transport.

Log messages SHALL be prefixed with `[tdai-mcp]` for identification.

#### Scenario: Log output goes to stderr

- **WHEN** the MCP server logs health check status or errors
- **THEN** all messages are written to stderr, not stdout
