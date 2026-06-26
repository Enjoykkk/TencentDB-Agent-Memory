# Claude Code 适配 — 架构图与数据流

## 一、Claude Code 适配总体架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Claude Code 进程                               │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  MCP Server (mcp-server.ts, stdio transport)                     │ │
│  │  • tdai_memory_search        ←→ POST /search/memories           │ │
│  │  • tdai_conversation_search  ←→ POST /search/conversations      │ │
│  │  • ensureGateway() — 自动检测 Gateway 存活, 不在则 spawn          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Hooks (hooks.json)                                              │ │
│  │  • UserPromptSubmit → POST /recall   (记忆召回, timeout=10s)      │ │
│  │  • Stop            → POST /capture   (记忆捕获)                   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  配置: .mcp.json (MCP注册) + plugin.json (插件元信息)              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP (localhost:8420)
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Gateway Server (独立 Node.js 进程)                 │
│                                                                       │
│  TdaiGateway (src/gateway/server.ts)                                  │
│                                                                       │
│  GET  /health                 → 状态检查                              │
│  POST /recall                 → handleBeforeRecall()                  │
│  POST /capture                → handleTurnCommitted()                 │
│  POST /search/memories        → searchMemories()                      │
│  POST /search/conversations   → searchConversations()                 │
│  POST /session/end            → handleSessionEnd()                    │
│  POST /seed                   → 种子导入                              │
│                                                                       │
│  StandaloneHostAdapter ←→ TdaiCore (同进程直接函数调用)                 │
│  StandaloneLLMRunner   ←→ OpenAI API (Vercel AI SDK)                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 二、Claude Code 在三平台中的位置

```
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────────┐
│  OpenClaw 进程    │        │  Hermes 进程      │        │  Claude Code 进程     │
│  (模式A: 进程内)   │        │  (模式B: Sidecar) │        │  (模式B: Sidecar)    │
│                  │        │                  │        │                      │
│  index.ts        │        │  Provider (.py)  │        │  MCP Server (.ts)    │
│  ↓ 直接调用       │        │  ↓ HTTP           │        │  ↓ HTTP              │
│  TdaiCore        │        │  Gateway Server  │        │  Gateway Server      │
│  (同进程)         │        │  (独立进程)       │        │  (独立进程)           │
└──────────────────┘        └──────────────────┘        └──────────────────────┘
                                       │                          │
                                       └──────────┬───────────────┘
                                                  │
                              ┌───────────────────▼───────────────────┐
                              │      同一份 Gateway Server              │
                              │      src/gateway/server.ts             │
                              │      (Hermes 和 Claude Code 共用)       │
                              └───────────────────────────────────────┘
```

---

## 三、目录结构与组件职责

```
claudecode-plugin/memory/memory_tencentdb/
├── mcp-server.ts          ← MCP 工具 + HTTP 客户端 + Gateway 自动拉起
├── hooks.json             ← recall / capture hook 配置
├── .mcp.json              ← MCP Server 注册
└── plugin.json            ← 插件元信息

各组件对标 Hermes:
  mcp-server.ts  ←→  client.py (HTTP 封装) + supervisor.py (进程管理 + health check)
  hooks.json     ←→  Provider 的 prefetch() / sync_turn() 生命周期回调
  .mcp.json      ←→  plugin.yaml 的平台注册
```

---

## 四、MCP Server 启动与 Gateway 自动拉起流程

```
MCP Server 启动
      │
      ▼
checkHealth(GATEWAY, 3s)
      │
      ├── 健康 → 跳过, 直接注册 MCP 工具
      │
      └── 不健康 → 检查 MEMORY_TENCENTDB_GATEWAY_CMD 环境变量
                    │
                    ├── 未设置 → 打印警告, 搜索工具不可用 (优雅降级)
                    │
                    └── 已设置 → spawn("sh", ["-c", cmd], { detached: true })
                                  │
                                  ▼
                                waitForHealth(GATEWAY, 30s)
                                  │  每 500ms 轮询 GET /health
                                  │
                                  ├── 30s 内健康 → Gateway 就绪
                                  └── 超时 → 打印警告, 优雅降级
```

---

## 五、对话生命周期数据流

```
时序: Claude Code 一个完整对话轮次

  User                Claude Code           MCP Server        Gateway           TdaiCore
  ────                ───────────           ──────────        ───────           ────────

  ① 输入消息 ─────────►
                      ② UserPromptSubmit hook 触发
                       POST /recall ──────────────────────────►
                                           { query, session_key }
                                                            ③ handleBeforeRecall()
                                                               L1搜索 + L2场景 + L3画像
                       ◄── { context } ───────────────────────
                      ④ 注入记忆到 system prompt

                      ⑤ LLM 推理 (带记忆上下文)

                      ⑥ LLM 回复完成
                      ⑦ Stop hook 触发
                       POST /capture ─────────────────────────►
                                    { user_content,
                                      assistant_content,
                                      session_key }
                                                            ⑧ handleTurnCommitted()
                                                               L0记录 + 向量索引 + 管线通知
                       ◄── { l0_recorded } ──────────────────

  ⑨ 看到回复 ◄─────────

  === Agent 主动调用搜索工具时 ===

                      MCP tool "tdai_memory_search" 触发
                       POST /search/memories ────────────────►
                                           { query, limit, type, scene }
                                                            ⑩ searchMemories()
                                                               混合搜索(keyword/embedding/hybrid)
                       ◄── { results } ──────────────────────
                      ⑪ 搜索结果注入 LLM 上下文
```

---

## 六、Claude Code Hook 与 MCP Tool 映射

```
Claude Code 事件              Gateway 端点                  TdaiCore 方法
─────────────────────         ───────────────               ─────────────────────
UserPromptSubmit (hook)  →   POST /recall              →   handleBeforeRecall()
Stop (hook)              →   POST /capture             →   handleTurnCommitted()
tdai_memory_search (MCP) →   POST /search/memories     →   searchMemories()
tdai_conversation_search (MCP) → POST /search/conversations → searchConversations()
(暂无)                        POST /session/end         →   handleSessionEnd()
```

---

## 七、Gateway 两种启动方式

```
方式 A: 手动管理 (推荐生产)
  ┌─────────────┐     ┌──────────────────┐
  │ 终端 1       │     │ 终端 2            │
  │             │     │                  │
  │ Gateway 启动 │     │ Claude Code 启动  │
  │ npx tsx     │     │ claude           │
  │ src/gateway │     │ --plugin-dir     │
  │ /server.ts  │     │ ./claudecode-    │
  │             │     │ plugin           │
  └──────┬──────┘     └────────┬─────────┘
         │                    │
         │    localhost:8420  │
         └────────────────────┘
             MCP Server 检测到 Gateway 已存活, 跳过 spawn

方式 B: 自动 spawn (开发便捷)
  ┌───────────────────────────────┐
  │ 终端                           │
  │                               │
  │ export MEMORY_TENCENTDB_      │
  │   GATEWAY_CMD="npx tsx        │
  │   /path/to/gateway/server.ts" │
  │                               │
  │ claude --plugin-dir           │
  │   ./claudecode-plugin         │
  └───────────────────────────────┘
      MCP Server 启动时检测 Gateway 不在 → 自动 spawn → 等待健康检查 → 就绪
```

---

## 八、关键文件索引

| 文件 | 职责 |
|------|------|
| `claudecode-plugin/memory/memory_tencentdb/mcp-server.ts` | MCP Server: 注册搜索工具 + HTTP 转发 + Gateway 自动拉起 |
| `claudecode-plugin/memory/memory_tencentdb/hooks.json` | Hook 配置: UserPromptSubmit→recall, Stop→capture |
| `claudecode-plugin/memory/memory_tencentdb/.mcp.json` | MCP 注册: stdio transport, 指向 mcp-server.js |
| `claudecode-plugin/memory/memory_tencentdb/plugin.json` | 插件元信息: name, version, author |
| `src/gateway/server.ts` | Gateway HTTP 服务 (Hermes 和 Claude Code 共用) |
| `src/gateway/types.ts` | HTTP API 请求/响应 TypeScript 类型 |
| `src/adapters/standalone/host-adapter.ts` | StandaloneHostAdapter (Gateway 使用) |
| `src/adapters/standalone/llm-runner.ts` | StandaloneLLMRunner (Vercel AI SDK) |
| `src/core/tdai-core.ts` | TdaiCore 核心引擎 |
| `src/core/types.ts` | HostAdapter, LLMRunner 等抽象接口 |
