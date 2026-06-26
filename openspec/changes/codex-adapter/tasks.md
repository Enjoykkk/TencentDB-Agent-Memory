## 1. Plugin scaffolding

- [x] 1.1 Create `codex-plugin/memory/memory_tencentdb/` directory structure
- [x] 1.2 Create `codex-plugin/memory/memory_tencentdb/.codex-plugin/plugin.json` manifest with name, version, description, and component pointers (skills, mcpServers, hooks)
- [x] 1.3 Create placeholder directories: `codex-plugin/memory/memory_tencentdb/hooks/`, `codex-plugin/memory/memory_tencentdb/skills/tencentdb-memory/`

## 2. Hook scripts — recall

- [x] 2.1 Create `codex-plugin/memory/memory_tencentdb/hooks/recall.ts`: read Codex hook JSON from stdin, extract `prompt` and `session_id`
- [x] 2.2 Implement POST to `{TDAI_GATEWAY_URL}/recall` with `{ query: prompt, session_key: session_id }` and 10s timeout (Gateway URL resolved from `TDAI_GATEWAY_URL` env var, default `http://127.0.0.1:8420`)
- [x] 2.3 Implement prompt file storage: write `{ prompt, timestamp }` to `~/.memory-tencentdb/prompts/{session_id}.json`
- [x] 2.4 Implement stale file cleanup: delete prompt files older than 24 hours on each write
- [x] 2.5 Return Codex hook output format: `{ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "<recall results>" } }`
- [x] 2.6 Gracefully handle Gateway timeout/error: return empty additionalContext, log warning to stderr

## 3. Hook scripts — capture

- [x] 3.1 Create `codex-plugin/memory/memory_tencentdb/hooks/capture.ts`: read Codex hook JSON from stdin, extract `session_id` and `last_assistant_message`
- [x] 3.2 Read stored prompt from `~/.memory-tencentdb/prompts/{session_id}.json`; if file missing or `last_assistant_message` is null, log warning and skip `/capture` call (Gateway requires non-empty `user_content` and `assistant_content`)
- [x] 3.3 Implement POST to `{TDAI_GATEWAY_URL}/capture` with `{ user_content: prompt, assistant_content: last_assistant_message, session_key: session_id }` and 30s timeout (Gateway URL resolved from `TDAI_GATEWAY_URL` env var, default `http://127.0.0.1:8420`)
- [x] 3.4 Delete prompt file after successful capture
- [x] 3.5 Return `{ continue: true }` on stdout (success or graceful failure)
- [x] 3.6 Gracefully handle missing prompt file, null assistant message, and Gateway errors without blocking agent (skip capture on missing data, return `{ "continue": true }`)

## 4. Hook configuration

- [x] 4.1 Create `codex-plugin/memory/memory_tencentdb/hooks/hooks.json` with `UserPromptSubmit` and `Stop` hook entries
- [x] 4.2 Configure both hooks as `type: "command"` using `npx tsx ${PLUGIN_ROOT}/hooks/recall.ts` and `npx tsx ${PLUGIN_ROOT}/hooks/capture.ts`
- [x] 4.3 Set appropriate timeout values (10s for recall, 30s for capture)
- [x] 4.4 Add `statusMessage` fields: "Recalling memory context…" (recall), "Capturing conversation turn…" (capture)
- [x] 4.5 Add `commandWindows` alternatives for Windows compatibility

## 5. MCP server

- [x] 5.1 Create `codex-plugin/memory/memory_tencentdb/mcp-server.ts`: initialize `McpServer` with name `"tencentdb-memory"` and version `"1.0.0"`
- [x] 5.2 Implement `ensureGateway()`: health check via `GET /health`, auto-spawn via `MEMORY_TENCENTDB_GATEWAY_CMD`, poll for 30s
- [x] 5.3 Register `tdai_memory_search` tool with Zod schema (query, limit, type, scene) forwarding to `POST /search/memories`
- [x] 5.4 Register `tdai_conversation_search` tool with Zod schema (query, limit, session_key) forwarding to `POST /search/conversations`
- [x] 5.5 Implement graceful degradation: tools return `isError: true` with "unavailable" message when Gateway down
- [x] 5.6 All log output goes to stderr via `console.error` with `[tdai-mcp]` prefix
- [x] 5.7 Create `codex-plugin/memory/memory_tencentdb/.mcp.json` with `"mcp_servers"` wrapped format: `{ "mcp_servers": { "tdai-memory": { "command": "npx", "args": ["tsx", "${PLUGIN_ROOT}/mcp-server.ts"] } } }`

## 6. Codex skills

- [x] 6.1 Create `codex-plugin/memory/memory_tencentdb/skills/tencentdb-memory/SKILL.md` with YAML frontmatter: `name: tencentdb-memory`, concise `description`
- [x] 6.2 Document memory tiers (L0/L1/L2/L3) for the agent
- [x] 6.3 Document when to use `tdai_memory_search` vs `tdai_conversation_search`
- [x] 6.4 Document that recall/capture are automatic — agent does NOT need to manually trigger them
- [x] 6.5 Document search result format and interpretation guidance

## 7. Runtime (no build step required)

- [x] 7.1 Hook scripts and MCP server run directly as TypeScript via `npx tsx` — `tsx` is already in `dependencies`, used by OpenClaw and Claude Code adapters alike. No compilation required.

## 8. Installation and uninstallation scripts

- [x] 8.1 Create `scripts/install-codex-plugin.js`: create `~/.agents/plugins/` directory if missing, write `marketplace.json` with plugin entry
- [x] 8.2 Install script must handle both fresh install (create directory) and reinstall (update entry)
- [x] 8.3 Marketplace entry must include `source` (local, with `./`-prefixed path), `policy` (`installation: "AVAILABLE"`, `authentication: "ON_INSTALL"`), and `category` (e.g., `"Productivity"`)
- [x] 8.4 Create `scripts/uninstall-codex-plugin.js`: remove `tencentdb-memory` entry from marketplace.json, delete file if empty, print cleanup guidance
- [x] 8.5 Uninstall script must handle: plugin found → remove, plugin not found → idempotent message, marketplace has other plugins → preserve others
- [x] 8.6 Uninstall script must print cleanup guidance: stop Gateway, optional data directory removal warning

## 9. Testing

- [x] 9.1 Test MCP server starts successfully with `node mcp-server.mjs`
- [x] 9.2 Test `tdai_memory_search` tool returns results when Gateway is running
- [x] 9.3 Test `tdai_memory_search` gracefully degrades when Gateway is down
- [x] 9.4 Test `tdai_conversation_search` tool returns results when Gateway is running
- [x] 9.5 Test recall hook correctly POSTs to Gateway and returns `additionalContext`
- [x] 9.6 Test capture hook correctly reads prompt file and POSTs to Gateway
- [x] 9.7 Test prompt file cleanup deletes files older than 24 hours
- [x] 9.8 Test `ensureGateway()`: health check, auto-spawn, timeout scenarios
- [x] 9.9 Test installation script creates valid marketplace entry
- [x] 9.10 Test uninstallation script removes entry and preserves other plugins
- [x] 9.11 Test uninstallation script is idempotent (running twice is safe)
- [x] 9.12 Test end-to-end: start Gateway → start MCP server → call search tool → verify results
- [x] 9.13 Test capture hook skips `/capture` when `last_assistant_message` is null
- [x] 9.14 Test capture hook skips `/capture` when prompt file does not exist
- [x] 9.15 Test recall hook returns empty `additionalContext` when Gateway returns zero matches

## 10. Documentation

- [x] 10.1 Create `codex-plugin/memory/memory_tencentdb/README.md` with install/uninstall/configuration instructions
- [x] 10.2 Document prerequisites: Node.js >= 22.16.0, Gateway running
- [x] 10.3 Document install: `node scripts/install-codex-plugin.js` + `codex plugin install tencentdb-memory`
- [x] 10.4 Document uninstall: `node scripts/uninstall-codex-plugin.js` + manual cleanup (Gateway shutdown, data directory removal)
- [x] 10.5 Document env vars: `TDAI_GATEWAY_URL`, `MEMORY_TENCENTDB_GATEWAY_CMD`, `TDAI_LLM_API_KEY`
- [x] 10.6 Document available MCP tools: `tdai_memory_search`, `tdai_conversation_search`
