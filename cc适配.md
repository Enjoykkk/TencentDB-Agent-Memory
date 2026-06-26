# Claude Code 适配步骤

## 1. 目录结构

```
claudecode-plugin/memory/memory_tencentdb/
├── mcp-server.ts    ← MCP 工具 + HTTP 客户端 + gateway 自动拉起
├── hooks.json       ← recall / capture hook 配置
├── .mcp.json        ← MCP server 注册
└── plugin.json      ← 插件元信息
```

## 2. mcp-server.ts

MCP server 启动时先检查 gateway 是否存活，不在就通过 `MEMORY_TENCENTDB_GATEWAY_CMD` 自动 spawn。然后注册两个 MCP tool，全部转发到 gateway。

```typescript
// claudecode-plugin/memory/memory_tencentdb/mcp-server.ts
import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GATEWAY = process.env.TDAI_GATEWAY_URL ?? "http://127.0.0.1:8420";

// ── Gateway 自动拉起 ──

function parseGatewayUrl(url: string): { host: string; port: number } {
  const u = new URL(url);
  return { host: u.hostname, port: parseInt(u.port, 10) || 8420 };
}

async function checkHealth(gatewayUrl: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const r = await fetch(`${gatewayUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return false;
    const body = (await r.json()) as { status?: string };
    return body.status === "ok" || body.status === "degraded";
  } catch {
    return false;
  }
}

async function waitForHealth(gatewayUrl: string, maxWaitMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await checkHealth(gatewayUrl, 2000)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function ensureGateway(): Promise<void> {
  if (await checkHealth(GATEWAY, 3000)) return;

  const cmd = process.env.MEMORY_TENCENTDB_GATEWAY_CMD;
  if (!cmd) {
    console.error(
      "[tdai-mcp] Gateway not running at %s and MEMORY_TENCENTDB_GATEWAY_CMD not set. " +
        "Search tools will be unavailable.",
      GATEWAY,
    );
    return;
  }

  console.error("[tdai-mcp] Gateway not running, spawning: %s", cmd);
  const { host, port } = parseGatewayUrl(GATEWAY);
  const child = spawn("sh", ["-c", cmd], {
    env: { ...process.env, TDAI_GATEWAY_HOST: host, TDAI_GATEWAY_PORT: String(port) },
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  if (!(await waitForHealth(GATEWAY))) {
    console.error("[tdai-mcp] Gateway did not become healthy within 30s.");
  } else {
    console.error("[tdai-mcp] Gateway is ready at %s", GATEWAY);
  }
}

// ── MCP Server ──

const server = new McpServer({ name: "tencentdb-memory", version: "1.0.0" });

server.tool(
  "tdai_memory_search",
  {
    query: z.string(),
    limit: z.number().optional(),
    type: z.string().optional(),
    scene: z.string().optional(),
  },
  async (p) => {
    try {
      const r = await fetch(`${GATEWAY}/search/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      return {
        content: [{ type: "text" as const, text: ((await r.json()) as { results?: string }).results ?? "" }],
      };
    } catch {
      return {
        content: [{ type: "text" as const, text: "Memory search unavailable." }],
        isError: true as const,
      };
    }
  },
);

server.tool(
  "tdai_conversation_search",
  {
    query: z.string(),
    limit: z.number().optional(),
    session_key: z.string().optional(),
  },
  async (p) => {
    try {
      const r = await fetch(`${GATEWAY}/search/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      return {
        content: [{ type: "text" as const, text: ((await r.json()) as { results?: string }).results ?? "" }],
      };
    } catch {
      return {
        content: [{ type: "text" as const, text: "Conversation search unavailable." }],
        isError: true as const,
      };
    }
  },
);

await ensureGateway();
await server.connect(new StdioServerTransport());
```

## 3. hooks.json

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "http", "url": "http://127.0.0.1:8420/recall", "timeout": 10 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "http", "url": "http://127.0.0.1:8420/capture" }] }
    ]
  }
}
```

## 4. .mcp.json

```json
{
  "mcpServers": {
    "tdai-memory": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-server.js"]
    }
  }
}
```

## 5. plugin.json

```json
{
  "name": "tencentdb-memory",
  "description": "TencentDB Agent Memory — four-layer memory system via Gateway sidecar",
  "version": "1.0.0",
  "author": { "name": "TencentDB Agent Memory Team" }
}
```

## 6. 用户启动

方式 A — 手动管理 gateway（推荐生产）：

```bash
TDAI_LLM_API_KEY=sk-xxx npx tsx src/gateway/server.ts &
claude --plugin-dir ./claudecode-plugin
```

方式 B — 自动 spawn gateway：

```bash
export MEMORY_TENCENTDB_GATEWAY_CMD="npx tsx /path/to/src/gateway/server.ts"
export TDAI_LLM_API_KEY=sk-xxx
claude --plugin-dir ./claudecode-plugin
```

## 7. 待做

- `mcp-server.ts` 编译为 `.mjs`：加 `build:mcp-server` script，生产用 `node mcp-server.js` 启动
- 把 `claudecode-plugin/` 作为独立 Claude Code plugin 发布到 npm

---

## 注意事项

- `src/adapters/claude-code/` 已删除，不再需要 `host-adapter.ts`、`llm-runner.ts`、`index.ts` — 这些由 `gateway/server.ts` + `standalone/` 统一提供
- daemon 只有一份 `gateway/server.ts`，Hermes 和 Claude Code 共用
