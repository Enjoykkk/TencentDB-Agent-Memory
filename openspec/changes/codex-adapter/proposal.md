## Why

OpenAI Codex 是一个不断增长的 Agent 编码平台，拥有 hook、MCP 工具和技能系统。将 TDAI 记忆系统引入 Codex，可以让 Codex 用户在对话之间获得持久记忆（L0 对话、L1 事实、L2 场景、L3 画像）——就像今天 OpenClaw 和 Hermes 用户所做的那样。Codex 的 hook 事件（`UserPromptSubmit`、`Stop`）与 TdaiCore 的召回/捕获生命周期精确对齐，而其 MCP 支持则处理 Agent 发起的搜索。

## 变更内容

- 在 `codex-plugin/` 下新增 **Codex 插件包**，包含完整的 `.codex-plugin/plugin.json` 清单、技能、hook 和 MCP 配置
- 新增 **Codex MCP Server**（`codex-plugin/memory/memory_tencentdb/mcp-server.ts`），注册 `tdai_memory_search` 和 `tdai_conversation_search` 工具，将请求转发至 Gateway
- 新增 **Codex hook 配置**（`codex-plugin/memory/memory_tencentdb/hooks/hooks.json`），连接 `UserPromptSubmit` → recall 和 `Stop` → capture
- 新增 **Codex 技能**（`codex-plugin/memory/memory_tencentdb/skills/`），提供 Agent 可见的记忆系统交互使用指引
- 新增 **安装/卸载脚本**（`scripts/install-codex-plugin.js`、`scripts/uninstall-codex-plugin.js`），将插件注册/移除到 Codex 的 marketplace
- 复用现有 **Gateway Server**（`src/gateway/server.ts`）和 **StandaloneHostAdapter** — 无需更改核心/适配器层

## 能力

### 新能力

- `codex-plugin`: Codex 插件包结构 — 清单、hook、MCP 配置及安装流程。将记忆系统打包为可安装的 Codex 插件。
- `codex-mcp-server`: MCP Server，暴露记忆和对话搜索工具。在启动时自动检测 Gateway 健康状况，并可选择通过 `MEMORY_TENCENTDB_GATEWAY_CMD` 自动拉起 Gateway。
- `codex-hooks`: 生命周期 hook（UserPromptSubmit → 记忆召回，Stop → 记忆捕获），将 Codex 对话事件映射至 TdaiCore 方法。
- `codex-skills`: Codex 技能，提供 Agent 可见的文档，说明记忆系统何时以及如何使用。


### 修改的能力

<!-- 无现有规格需要修改 — 新增代码不会改变核心行为 -->

## 影响

- **新增文件**：`codex-plugin/` 目录（插件清单、MCP server、hook、技能）、`scripts/install-codex-plugin.js`、`scripts/uninstall-codex-plugin.js`
- **零核心变更**：`src/core/`、`src/adapters/standalone/` 和 `src/gateway/server.ts` 均不受影响
- **依赖项**：`tsx` 已在 `dependencies` 中被 OpenClaw / Claude Code 适配共用。Hook 脚本和 MCP server 通过 `npx tsx` 直接运行 TypeScript，无需编译。`@modelcontextprotocol/sdk` 和 `zod` 与 Claude Code 插件共用，由 `tsx` 在运行时解析
- **文档**：`codex-plugin/memory/memory_tencentdb/README.md`（Codex 插件独立文档，含安装/卸载/配置说明）
