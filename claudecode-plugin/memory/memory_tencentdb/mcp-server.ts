/**
 * TDAI Memory MCP Server — Claude Code plugin entry point.
 *
 * Registers two MCP tools (tdai_memory_search, tdai_conversation_search)
 * that forward requests to the Gateway HTTP API. On startup, checks whether
 * the Gateway is already running; if not, attempts to auto-spawn it via the
 * MEMORY_TENCENTDB_GATEWAY_CMD environment variable.
 *
 * Counterpart to Hermes:
 *   mcp-server.ts  ←→  client.py (HTTP wrapper) + supervisor.py (process management)
 *
 * Usage:
 *   node --import tsx claudecode-plugin/memory/memory_tencentdb/mcp-server.ts
 */

import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ============================
// Configuration
// ============================

const GATEWAY = process.env.TDAI_GATEWAY_URL ?? "http://127.0.0.1:8420";
const TAG = "[tdai-mcp]";

// ============================
// Logger (mirrors gateway/server.ts createConsoleLogger)
// ============================

function createLogger(): { debug: (msg: string) => void; info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void } {
  return {
    debug: (msg: string) => console.error(`${TAG} ${msg}`),
    info: (msg: string) => console.error(`${TAG} ${msg}`),
    warn: (msg: string) => console.error(`${TAG} ${msg}`),
    error: (msg: string) => console.error(`${TAG} ${msg}`),
  };
}

const logger = createLogger();

// ============================
// Gateway lifecycle (mirrors Hermes GatewaySupervisor)
// ============================

function parseGatewayUrl(url: string): { host: string; port: number } {
  const u = new URL(url);
  return { host: u.hostname, port: parseInt(u.port, 10) || 8420 };
}

/**
 * Check whether the Gateway is responsive.
 * Returns true when GET /health responds with status "ok" or "degraded".
 */
async function checkHealth(gatewayUrl: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const r = await fetch(`${gatewayUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return false;
    const body = (await r.json()) as { status?: string };
    return body.status === "ok" || body.status === "degraded";
  } catch {
    return false;
  }
}

/**
 * Poll GET /health until the Gateway responds or maxWaitMs elapses.
 */
async function waitForHealth(
  gatewayUrl: string,
  maxWaitMs = 30_000,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await checkHealth(gatewayUrl, 2000)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Ensure the Gateway is running.
 *
 * - If already healthy, return immediately.
 * - Otherwise, spawn the command from MEMORY_TENCENTDB_GATEWAY_CMD
 *   and poll /health for up to 30 s.
 * - If the env var is not set, log a warning and proceed without
 *   search tools (graceful degradation).
 */
async function ensureGateway(): Promise<void> {
  if (await checkHealth(GATEWAY, 3000)) return;

  const cmd = process.env.MEMORY_TENCENTDB_GATEWAY_CMD;
  if (!cmd) {
    logger.warn(
      `Gateway not running at ${GATEWAY} and MEMORY_TENCENTDB_GATEWAY_CMD not set. ` +
        `Search tools will be unavailable. ` +
        `Start the Gateway manually or set MEMORY_TENCENTDB_GATEWAY_CMD to auto-spawn.`,
    );
    return;
  }

  logger.info(`Gateway not running, spawning: ${cmd}`);
  const { host, port } = parseGatewayUrl(GATEWAY);
  const child = spawn("sh", ["-c", cmd], {
    env: {
      ...process.env,
      TDAI_GATEWAY_HOST: host,
      TDAI_GATEWAY_PORT: String(port),
    },
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  if (!(await waitForHealth(GATEWAY))) {
    logger.warn("Gateway did not become healthy within 30 s. Search tools will be unavailable.");
  } else {
    logger.info(`Gateway is ready at ${GATEWAY}`);
  }
}

// ============================
// MCP Server
// ============================

const server = new McpServer({ name: "tencentdb-memory", version: "1.0.0" });

/**
 * Register tdai_memory_search — L1 structured memory search.
 *
 * Forwards to POST /search/memories on the Gateway.
 * Parameters are passed through as-is; the Gateway validates and executes.
 */
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
        content: [
          {
            type: "text" as const,
            text: "Memory search unavailable. Please try again later.",
          },
        ],
        isError: true as const,
      };
    }
  },
);

/**
 * Register tdai_conversation_search — L0 raw conversation search.
 *
 * Forwards to POST /search/conversations on the Gateway.
 * Parameters are passed through as-is; the Gateway validates and executes.
 */
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
        content: [
          {
            type: "text" as const,
            text: "Conversation search unavailable. Please try again later.",
          },
        ],
        isError: true as const,
      };
    }
  },
);

// ============================
// Startup
// ============================

await ensureGateway();
await server.connect(new StdioServerTransport());
