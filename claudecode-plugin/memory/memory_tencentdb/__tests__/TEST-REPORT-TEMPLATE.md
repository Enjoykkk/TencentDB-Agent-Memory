# Claude Code Plugin — Adapter Test Report

> **Test Date**: YYYY-MM-DD
> **Tester**: _______
> **Plugin Version**: 1.0.0
> **Gateway Version**: 0.1.0
> **Claude Code Version**: _______
> **Node.js Version**: _______

---

## 1. Test Environment

| Item | Value |
|------|-------|
| OS | _______ |
| Gateway URL | http://127.0.0.1:8420 |
| LLM Provider | _______ |
| LLM Model | _______ |
| Embedding Provider | _______ |
| Embedding Model | _______ |
| Data Directory | _______ |

---

## 2. Results Overview

| Test Dimension | Cases | Pass | Fail | Skip | Pass Rate |
|---------------|:-----:|:----:|:----:|:----:|:---------:|
| 1. Health Check | 3 | | | | |
| 2. Recall Endpoint | 4 | | | | |
| 3. Capture Endpoint | 5 | | | | |
| 4. Memory Search | 5 | | | | |
| 5. Conversation Search | 3 | | | | |
| 6. Session End | 2 | | | | |
| 7. Data Flow E2E | 4 | | | | |
| 8. Error Paths | 3 | | | | |
| 9. MCP Tool Registration | 3 | | | | |
| 10. Gateway Auto-spawn | 3 | | | | |
| 11. Claude Code E2E | 5 | | | | |
| **Total** | **40** | | | | |

**Verdict**: □ Pass  □ Conditional Pass  □ Fail

---

## 3. Detailed Results

### 3.1 Health Check (3 cases)

| # | Case | Result | Notes |
|---|------|:------:|-------|
| 1.1 | GET /health returns ok | | |
| 1.2 | Includes version + uptime | | |
| 1.3 | Reports stores status | | |

### 3.2 Recall Endpoint — Hook: UserPromptSubmit (4 cases)

| # | Case | Input | Expected | Result | Notes |
|---|------|-------|----------|:------:|-------|
| 2.1 | Normal recall | `{query, session_key}` | 200, returns context | | |
| 2.2 | Missing query | `{session_key}` | 400 | | |
| 2.3 | Missing session_key | `{query}` | 400 | | |
| 2.4 | Empty query | `{query:""}` | 400 | | |

### 3.3 Capture Endpoint — Hook: Stop (5 cases)

| # | Case | Input | Expected | Result | Notes |
|---|------|-------|----------|:------:|-------|
| 3.1 | Normal capture | Full user/assistant/session | l0_recorded > 0 | | |
| 3.2 | With messages array | Full message history | l0_recorded > 0 | | |
| 3.3 | Missing user_content | — | 400 | | |
| 3.4 | Missing assistant_content | — | 400 | | |
| 3.5 | Missing session_key | — | 400 | | |

### 3.4 Memory Search — MCP: tdai_memory_search (5 cases)

| # | Case | Input | Expected | Result | Notes |
|---|------|-------|----------|:------:|-------|
| 4.1 | Normal search | `{query, limit}` | results + total | | |
| 4.2 | Type filter | `{query, type:"episodic"}` | 200 | | |
| 4.3 | Scene filter | `{query, scene:"coding"}` | 200 | | |
| 4.4 | Missing query | — | 400 | | |
| 4.5 | Empty query | `{query:""}` | 400 | | |

### 3.5 Conversation Search — MCP: tdai_conversation_search (3 cases)

| # | Case | Input | Expected | Result | Notes |
|---|------|-------|----------|:------:|-------|
| 5.1 | Normal search | `{query, limit}` | results + total | | |
| 5.2 | Session filter | With session_key | 200 | | |
| 5.3 | Missing query | — | 400 | | |

### 3.6 Session End (2 cases)

| # | Case | Input | Expected | Result | Notes |
|---|------|-------|----------|:------:|-------|
| 6.1 | Normal end | `{session_key}` | `{flushed:true}` | | |
| 6.2 | Missing session_key | — | 400 | | |

### 3.7 Data Flow E2E (4 cases)

| # | Case | Operation | Expected | Result | Notes |
|---|------|-----------|----------|:------:|-------|
| 7.1 | capture | Write marked conversation | l0 > 0 | | |
| 7.2 | search/conversations | Search for marker | Found | | |
| 7.3 | recall | Recall based on new memory | context non-empty | | |
| 7.4 | session/end | Flush session | flushed=true | | |

### 3.8 Error Paths (3 cases)

| # | Case | Operation | Expected | Result | Notes |
|---|------|-----------|----------|:------:|-------|
| 8.1 | 404 route | POST /unknown | 404 | | |
| 8.2 | Bad JSON | Malformed body | ≥400, no crash | | |
| 8.3 | Oversized data | query=100KB | 200 or 400 | | |

### 3.9 MCP Tool Registration (3 cases)

| # | Case | Method | Expected | Result | Notes |
|---|------|--------|----------|:------:|-------|
| 9.1 | Tool list | MCP tools/list | Includes tdai_memory_search | | |
| 9.2 | Tool list | MCP tools/list | Includes tdai_conversation_search | | |
| 9.3 | Tool call | Call tdai_memory_search | Returns search results | | |

> Test method:
> ```bash
> echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
>   TDAI_GATEWAY_URL=http://127.0.0.1:8420 node --import tsx \
>   claudecode-plugin/memory/memory_tencentdb/mcp-server.ts
> ```

### 3.10 Gateway Auto-spawn (3 cases)

| # | Case | Operation | Expected | Result | Notes |
|---|------|-----------|----------|:------:|-------|
| 10.1 | Auto-spawn when down | Stop Gateway → start MCP | spawn + health ready | | |
| 10.2 | Skip when running | Gateway running → start MCP | Direct connect, no duplicate spawn | | |
| 10.3 | Spawn timeout handling | Set invalid CMD | 30s timeout + log warning | | |

> Test method:
> ```bash
> # 10.1 Auto-spawn
> kill $(lsof -ti:8420) 2>/dev/null
> export MEMORY_TENCENTDB_GATEWAY_CMD="npx tsx $PWD/src/gateway/server.ts"
> export TDAI_LLM_API_KEY=sk-xxx
> timeout 35 node --import tsx claudecode-plugin/memory/memory_tencentdb/mcp-server.ts
> # Expected: Gateway not running, spawning: ... → Gateway is ready
> ```

### 3.11 Claude Code E2E (5 cases)

| # | Case | Steps | Expected | Result | Notes |
|---|------|-------|----------|:------:|-------|
| 11.1 | Plugin loads | `claude --plugin-dir ./claudecode-plugin` | Starts normally, no errors | | |
| 11.2 | Recall Hook | Send "My name is XX, I like YY" | Conversation works | | |
| 11.3 | Capture Hook | `/exit` → re-enter | Old memories recallable in new session | | |
| 11.4 | MCP search tool | "Use tdai_memory_search to find XX" | Tool returns results | | |
| 11.5 | MCP conversation search | "Use tdai_conversation_search to find YY" | Tool returns results | | |

> E2E test script:
> ```
> # Conversation 1
> User: Hi, my name is Alex, I'm a backend engineer using Go and Rust.
> Assistant: ... (any reply)
> User: /exit
>
> # Conversation 2 (new session)
> User: What name did I tell you earlier?
> # Expected: Claude recalls via recall hook, answers "Alex"
>
> User: Use tdai_memory_search to search for memories about "programming language".
> # Expected: Returns memories containing Go, Rust
> ```

---

## 4. Performance Metrics

| Metric | Target | Measured | Meets Target |
|--------|--------|----------|:------------:|
| /health response time | < 50ms | | |
| /recall response time (no memories) | < 500ms | | |
| /recall response time (with memories) | < 2s | | |
| /capture response time | < 1s | | |
| /search/memories response time | < 2s | | |
| Gateway startup to healthy | < 10s | | |
| MCP startup to ready | < 35s (incl. spawn) | | |

---

## 5. Defects Found

| # | Severity | Location | Description | Repro Steps | Status |
|---|:--------:|----------|-------------|--------------|:------:|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

---

## 6. Adapter Completeness Checklist

| # | Item | Done | Notes |
|---|------|:----:|-------|
| 1 | Parse platform config → MemoryTdaiConfig | □ | Via Gateway `loadGatewayConfig()` |
| 2 | Implement HostAdapter (StandaloneHostAdapter reused) | □ | |
| 3 | TdaiCore.initialize() | □ | Called in Gateway.start() |
| 4 | Pre-turn Hook → handleBeforeRecall() | □ | `UserPromptSubmit` → POST `/recall` |
| 5 | Post-turn Hook → handleTurnCommitted() | □ | `Stop` → POST `/capture` |
| 6 | Register MCP tool → searchMemories | □ | `tdai_memory_search` |
| 7 | Register MCP tool → searchConversations | □ | `tdai_conversation_search` |
| 8 | Shutdown Hook → destroy() | □ | Gateway SIGTERM handler |
| 9 | (Optional) Session End → handleSessionEnd() | □ | POST `/session/end` |
| 10 | Gateway auto-spawn | □ | mcp-server.ts `ensureGateway()` |

---

## 7. Test Environment Cleanup

```bash
# Stop test processes
kill $(lsof -ti:8420) 2>/dev/null || true

# Clean up test data (optional)
rm -rf ~/.memory-tencentdb/memory-tdai/cc-plugin-test-*
```

---

## 8. Sign-off

| Role | Name | Date |
|------|------|------|
| Test Execution | | |
| Review | | |
