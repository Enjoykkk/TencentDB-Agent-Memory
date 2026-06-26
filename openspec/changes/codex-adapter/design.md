## Context

TDAI 记忆系统目前通过两种模式为两个平台提供服务：OpenClaw（模式 A，进程内插件）和 Hermes（模式 B，通过 Gateway 的 HTTP Sidecar）。Claude Code 适配（`claudecode-plugin/`）证明了第三种变体：共享 Gateway server 的 MCP + Hooks sidecar。本设计将该模式应用于 OpenAI Codex。

Codex 提供四个集成接口：
- **Hooks**（`hooks/hooks.json`）：生命周期事件（`UserPromptSubmit`、`Stop`），使用 `type: "command"` 处理方式（通过 stdin 接收 JSON，通过 stdout 返回 JSON）
- **MCP**（`.mcp.json`）：工具注册（与 Claude Code 的 MCP 格式相同）
- **Skills**（`skills/*/SKILL.md`）：Agent 可见的文档，指导何时及如何使用记忆系统
- **Plugins**（`.codex-plugin/plugin.json`）：将 hooks、MCP 服务器和技能打包为可安装单元的清单

与 Claude Code 的关键区别：Codex 的 hooks 使用 `type: "command"`（执行脚本），而非 `type: "http"`（直接 HTTP 调用）。这意味着我们需要编写小型适配脚本，将 Codex hook 的 stdin JSON 转换为 Gateway HTTP 请求。

本设计遵循 Claude Code 适配中确立的模式：**不创建新的 HostAdapter**。Gateway server（`src/gateway/server.ts`）和 StandaloneHostAdapter 直接复用。Codex 插件只是一个 thin bridge，将 Codex 事件转发至 Gateway。

## Goals / Non-Goals

**Goals:**
- 提供完整功能的 Codex 插件，具备自动记忆召回和捕获能力
- 将 `tdai_memory_search` 和 `tdai_conversation_search` 暴露为 MCP 工具
- 提供 Agent 可见的技能文档，说明何时使用记忆搜索
- 支持两种 Gateway 启动方式：手动管理（生产环境）和自动拉起（开发环境）
- 遵循与 Claude Code 插件相同的 Sidecar 架构

**Non-Goals:**
- 进程内 HostAdapter（无需新的 `src/adapters/codex/`）
- 修改 TdaiCore 或 Gateway server
- 修改现有适配器
- Codex 插件在 npm 上的分发（后续工作）
- 为 Codex 插件提供 Docker 部署（当前仅限本地）

## Decisions

### 决策 1：使用 Sidecar 模式（复用 Gateway），而非进程内适配器

**理由**：Claude Code 适配已证明 Sidecar 模式行之有效。Gateway server 已生产环境就绪，具备健康检查、熔断和错误处理能力。在 `src/adapters/` 中创建一个新的进程内适配器（如 `CodexHostAdapter`）意味着重复造轮子 — 增加代码量、增加维护负担，且无实际收益。

**考虑的替代方案**：
- **进程内插件适配器**（类似 OpenClaw）：Codex 确实有插件 SDK（`@opencode-ai/codex` 或类似），但插件 API 并不像 OpenClaw 那样暴露 `runEmbeddedPiAgent`。为 LLM 运行器创建新的代码路径会增加未测试的表面积。被否决。
- **独立的 HTTP server**（如 Hermes）：Gateway 已经存在。无需新增。

### 决策 2：TypeScript 脚本通过 `npx tsx` 直接运行

**理由**：Codex 的 hook 系统只支持 `type: "command"`（执行 shell 命令或脚本）。项目已在 Node.js/TypeScript 中完成，`tsx` 已在 `dependencies` 中（被 OpenClaw 和 Claude Code 适配共用）。使用 `npx tsx` 直接执行 `.ts` 文件，无需编译步骤，与其他平台一致。

Hook 脚本和 MCP server 分别使用 `npx tsx ${PLUGIN_ROOT}/hooks/recall.ts` 和 `npx tsx ${PLUGIN_ROOT}/mcp-server.ts` 运行，`npx` 从当前项目的 `node_modules` 中解析 `tsx`，TypeScript 源文件即改即用。

**考虑的替代方案**：
- **编译为 .mjs 再运行**：需要额外的 build 脚本和 tsconfig，增加工作流程摩擦。其他平台（OpenClaw、Claude Code、Hermes）都不需要编译。被否决。
- **Python 脚本**：需要 Python 运行时。增加另一个语言依赖。被否决。
- **Shell 脚本（curl + jq）**：跨平台脆弱。jq 并非预装。被否决。

### 决策 3：通过基于会话 ID 的临时文件关联 UserPromptSubmit 和 Stop 事件

**困境**：`UserPromptSubmit` hook 接收用户提示文本。`Stop` hook 接收助手的回复。如需调用 `handleTurnCommitted()`，两者都需要。但 Codex 不会自动在 hook 间传递用户提示。

**解决方案**：在 `UserPromptSubmit` 期间，将 `{ prompt, timestamp }` 写入 `~/.memory-tencentdb/prompts/{session_id}.json`。在 `Stop` 期间，读取该文件以检索原始提示，调用 `POST /capture`，然后删除文件。若 prompt 文件缺失或 `last_assistant_message` 为 null，则跳过 capture（Gateway 要求 `user_content` 和 `assistant_content` 均非空）。

```
UserPromptSubmit                    Stop
     │                                │
     ├─ POST /recall ──────────────► Gateway
     ├─ write prompts/{sid}.json      │
     │                                ├─ read prompts/{sid}.json
     │                                ├─ POST /capture ─────────► Gateway
     │                                └─ delete prompts/{sid}.json
```

**考虑的替代方案**：
- **环境变量**：无法在 hook 调用之间持久化数据。被否决。
- **基于 MCP 的捕获**：Codex 的 MCP 服务器随平台会话启动/停止，这可能与对话生命周期不一致。Hooks 才是正确的钩子点。被否决。
- **修改 Gateway 以缓冲用户提示**：为这一个用例在 Gateway 中增加状态管理引入了复杂性。临时文件更简单、更易调试。被采纳。

### 决策 4：遵循 Claude Code 模式的三合一 MCP server + Gateway lifecycle + 工具注册

MCP server 代码（`codex-plugin/memory/memory_tencentdb/mcp-server.ts`）结构上将与 Claude Code 版本相同：
1. `ensureGateway()` — 检查健康状况，可选择自动拉起
2. 注册 `tdai_memory_search`（转发到 `POST /search/memories`）
3. 注册 `tdai_conversation_search`（转发到 `POST /search/conversations`）

**与 Claude Code 的区别**：Codex 的 `.mcp.json` 使用 wrapped `mcp_servers` 格式声明服务器（`{ "mcp_servers": { "server-name": { ... } } }`），hook 命令中使用 `${PLUGIN_ROOT}` 环境变量引用插件内路径。Claude Code 则使用 `${CLAUDE_PLUGIN_ROOT}`（Codex 同时设置两个变量以保持兼容）。

### 决策 5：提供 Agent 可见的指导技能

创建 `codex-plugin/memory/memory_tencentdb/skills/tencentdb-memory/SKILL.md`，告知 Codex Agent：
- 存在哪些记忆工具（`tdai_memory_search`、`tdai_conversation_search`）
- 何时使用各工具（查找过去上下文 vs 查找具体对话）
- 记忆在后台自动召回（无需手动操作）
- 搜索结果的格式

这遵循了 Codex 技能的 [open agent skills standard](https://agentskills.io)。

**非目标**：该技能不实现任何自定义逻辑 — 它纯粹是 Agent 指令文档。

## Risks / Trade-offs

- **[风险] 临时文件泄漏**：如果 `Stop` 从未触发（崩溃、强制退出），`~/.memory-tencentdb/prompts/` 中的提示文件会残留。→ **缓解措施**：(a) 写入时包含时间戳。(b) 在下次 UserPromptSubmit 中对超过 24 小时的过期文件运行简单的清理流程。(c) 文件体积非常小（每条提示约 ~1KB），因此即便有泄漏也是良性的。

- **[风险] 并发会话**：多个 Codex 会话可能同时触发 hooks。→ **缓解措施**：临时文件以 `session_id` 为键，实现自然隔离。每个 `Stop` 仅读取其对应 `session_id` 的文件。无共享的可变状态。

- **[权衡] 无会话结束 hook**：Codex 没有会话关闭事件。`handleSessionEnd()` 不会在 Codex 中被调用。→ **影响**：会话数据可能留在内存管线缓冲区中，直至超时刷新。低风险 — 管线对 L0 使用追加写入，数据不会丢失。

- **[权衡] Hook 超时**：Codex 的默认 hook 超时为 600 秒（10 分钟），但我们为 recall hook 设置了 10 秒的 HTTP 超时。如果 Gateway 响应缓慢，Codex 不会挂起。→ **可接受**：Gateway 运行在 localhost 上，延迟应低于 100ms。10 秒是充裕的上限。

## Open Questions

- Codex 是应该使用一份**独立**的 `.mcp.json`（仅用于记忆工具），还是应该与项目中可能存在的现有 MCP 配置**合并**？回答：独立配置 — `.mcp.json` 随插件一起打包，不会与用户的全局 MCP 配置冲突。
