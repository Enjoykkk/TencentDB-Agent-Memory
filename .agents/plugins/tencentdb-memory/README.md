# TencentDB Agent Memory — Codex Plugin

Four-layer local memory system (L0 conversation / L1 extraction / L2 scene / L3 persona) for OpenAI Codex, via Gateway sidecar.

## Prerequisites

- **Node.js** >= 22.16.0
- **Gateway** running (start manually or configure auto-spawn — see below)

## Installation

```bash
# 1. Install into Codex's local marketplace
#    (copies the plugin to ~/.agents/plugins/tencentdb-memory/ and creates marketplace entry)
node scripts/install-codex-plugin.js

# 2. Restart Codex

# 3. In Codex, open the Plugins panel and install "tencentdb-memory"
#    from your local marketplace

# 4. Run /hooks in Codex, review both hooks, and click Trust
```

## Uninstallation

```bash
# 1. Remove the plugin from the marketplace
node scripts/uninstall-codex-plugin.js

# 2. Stop the Gateway process if running
#    Unix: pkill -f "gateway/server.ts"
#    Windows: Close the Gateway terminal, or taskkill /F /IM node.exe

# 3. (Optional) Delete stored memory data — THIS IS IRREVERSIBLE
#    Unix:    rm -rf ~/.memory-tencentdb
#    Windows: rmdir /s %USERPROFILE%\.memory-tencentdb
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TDAI_GATEWAY_URL` | `http://127.0.0.1:8420` | Gateway HTTP API base URL |
| `MEMORY_TENCENTDB_GATEWAY_CMD` | (none) | Shell command to auto-spawn the Gateway. Example: `cd /path/to/project && npx tsx src/gateway/server.ts` |
| `TDAI_LLM_API_KEY` | (none) | API key for LLM extraction (required for L1/L3 pipeline) |

### Gateway Management

**Manual start (recommended for production):**
```bash
npx tsx src/gateway/server.ts
```

**Auto-spawn (convenient for development):**
Set `MEMORY_TENCENTDB_GATEWAY_CMD` to the command that starts your Gateway. The MCP server will spawn it on first use if the Gateway is not already running. Example:
```bash
export MEMORY_TENCENTDB_GATEWAY_CMD="cd ~/projects/memory-tencentdb && npx tsx src/gateway/server.ts"
```

The MCP server polls `GET /health` every 500ms for up to 30 seconds waiting for the Gateway to become ready. If the Gateway doesn't start in time or `MEMORY_TENCENTDB_GATEWAY_CMD` is not set, the MCP tools gracefully degrade — they return "unavailable" messages instead of errors.

## Available MCP Tools

### `tdai_memory_search`

Search structured L1 memories (facts, preferences, instructions, persona).

**Parameters:**
- `query` (string, required) — Search query
- `limit` (number, optional, default: 5, max: 20) — Max results
- `type` (string, optional) — Filter: `persona`, `episodic`, `instruction`
- `scene` (string, optional) — Filter by scene name

### `tdai_conversation_search`

Search raw L0 conversation records.

**Parameters:**
- `query` (string, required) — Search query
- `limit` (number, optional, default: 5, max: 20) — Max results
- `session_key` (string, optional) — Filter by session

## Architecture

```
Codex Agent
    │
    ├─ UserPromptSubmit hook → recall.ts (npx tsx) → POST /recall → Gateway → TdaiCore
    │                                                          └── → inject context
    │
    ├─ Agent uses MCP tools → mcp-server.ts (npx tsx) → POST /search/* → Gateway
    │
    └─ Stop hook → capture.ts (npx tsx) → POST /capture → Gateway → TdaiCore
                                                   └── → store turn in L0 pipeline
```

The plugin does not embed TdaiCore — it uses the existing Gateway server as a sidecar. This is the same architecture as the Claude Code plugin.

## Updating

After making changes to the plugin source files, re-run the install script to copy the updated files:

```bash
node scripts/install-codex-plugin.js
# Restart Codex
```

No build step is needed — `npx tsx` runs TypeScript directly.

## Related

- [OpenAI Codex Plugins](https://developers.openai.com/codex/plugins)
- [OpenAI Codex Hooks](https://developers.openai.com/codex/hooks)
- [Model Context Protocol](https://modelcontextprotocol.io)
