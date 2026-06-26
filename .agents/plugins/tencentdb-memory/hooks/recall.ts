/**
 * Codex UserPromptSubmit hook — memory recall.
 *
 * Reads the hook event JSON from stdin, calls the Gateway /recall endpoint,
 * stores the user prompt for later correlation by the Stop hook, and returns
 * matching memories as additionalContext.
 *
 * Compiled to recall.mjs by `npm run build:codex-plugin`.
 * Executed by Codex via: node ${PLUGIN_ROOT}/hooks/recall.mjs
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ============================
// Configuration
// ============================

const GATEWAY_URL = process.env.TDAI_GATEWAY_URL ?? "http://127.0.0.1:8420";
const PROMPTS_DIR = path.join(os.homedir(), ".memory-tencentdb", "prompts");
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const HTTP_TIMEOUT_MS = 10_000;

// ============================
// Types
// ============================

interface HookInput {
  session_id: string;
  prompt: string;
  hook_event_name: string;
  cwd: string;
}

interface RecallResponse {
  context?: string;
  strategy?: string;
  memory_count?: number;
}

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    additionalContext: string;
  };
}

// ============================
// Helpers
// ============================

function log(msg: string): void {
  process.stderr.write(`[tdai-recall] ${msg}\n`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Delete prompt files older than 24 hours.
 */
function cleanupStaleFiles(): void {
  if (!fs.existsSync(PROMPTS_DIR)) return;

  const now = Date.now();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(PROMPTS_DIR, { withFileTypes: true });
  } catch {
    return; // can't read dir, skip cleanup
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

    const filePath = path.join(PROMPTS_DIR, entry.name);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw) as { timestamp?: string };
      const ts = data.timestamp ? Date.parse(data.timestamp) : 0;
      if (ts > 0 && now - ts > STALE_THRESHOLD_MS) {
        fs.unlinkSync(filePath);
        log(`Cleaned up stale prompt file: ${entry.name}`);
      }
    } catch {
      // If we can't read/parse, delete the corrupt file
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
  }
}

/**
 * Store the user prompt for later correlation by the Stop/capture hook.
 */
function storePrompt(sessionId: string, prompt: string): void {
  ensureDir(PROMPTS_DIR);
  const filePath = path.join(PROMPTS_DIR, `${sessionId}.json`);
  const data = {
    prompt,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
}

// ============================
// Main
// ============================

async function main(): Promise<void> {
  // 1. Parse stdin JSON
  let input: HookInput;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf-8");
    input = JSON.parse(raw) as HookInput;
  } catch (err) {
    log(`Failed to parse stdin JSON: ${err}`);
    // Return empty context — don't block the agent
    const output: HookOutput = {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "",
      },
    };
    process.stdout.write(JSON.stringify(output));
    return;
  }

  const { session_id, prompt } = input;

  // 2. Store prompt for later Stop/capture correlation
  try {
    storePrompt(session_id, prompt);
  } catch (err) {
    log(`Failed to store prompt file: ${err}`);
    // Non-fatal: capture will just skip if file is missing
  }

  // 3. Clean up stale prompt files
  try {
    cleanupStaleFiles();
  } catch (err) {
    log(`Failed to cleanup stale files: ${err}`);
    // Non-fatal
  }

  // 4. Call Gateway /recall
  let additionalContext = "";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    const resp = await fetch(`${GATEWAY_URL}/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: prompt,
        session_key: session_id,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const body = (await resp.json()) as RecallResponse;
      additionalContext = body.context ?? "";
    } else {
      log(`Gateway /recall returned status ${resp.status}`);
    }
  } catch (err) {
    log(`Gateway /recall failed: ${err}`);
    // Graceful degradation: return empty context
  }

  // 5. Return hook output
  const output: HookOutput = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(output));
}

main().catch((err) => {
  log(`Unexpected error: ${err}`);
  // Last-resort: return empty context so agent is not blocked
  const output: HookOutput = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: "",
    },
  };
  process.stdout.write(JSON.stringify(output));
});
