/**
 * Codex Stop hook — memory capture.
 *
 * Reads the hook event JSON from stdin, retrieves the stored user prompt
 * (written by the recall hook), calls the Gateway /capture endpoint, and
 * cleans up the prompt file.
 *
 * Compiled to capture.mjs by `npm run build:codex-plugin`.
 * Executed by Codex via: node ${PLUGIN_ROOT}/hooks/capture.mjs
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ============================
// Configuration
// ============================

const GATEWAY_URL = process.env.TDAI_GATEWAY_URL ?? "http://127.0.0.1:8420";
const PROMPTS_DIR = path.join(os.homedir(), ".memory-tencentdb", "prompts");
const HTTP_TIMEOUT_MS = 30_000;

// ============================
// Types
// ============================

interface HookInput {
  session_id: string;
  last_assistant_message: string | null;
  hook_event_name: string;
  cwd: string;
}

interface PromptData {
  prompt: string;
  timestamp: string;
}

interface HookOutput {
  continue: boolean;
}

// ============================
// Helpers
// ============================

function log(msg: string): void {
  process.stderr.write(`[tdai-capture] ${msg}\n`);
}

function readPromptFile(sessionId: string): PromptData | null {
  const filePath = path.join(PROMPTS_DIR, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as PromptData;
  } catch {
    return null;
  }
}

function deletePromptFile(sessionId: string): void {
  const filePath = path.join(PROMPTS_DIR, `${sessionId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Best-effort cleanup
  }
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
    const output: HookOutput = { continue: true };
    process.stdout.write(JSON.stringify(output));
    return;
  }

  const { session_id, last_assistant_message } = input;

  // 2. Check preconditions — Gateway requires non-empty user_content and assistant_content
  if (last_assistant_message === null || last_assistant_message === undefined) {
    log("last_assistant_message is null, skipping capture");
    const output: HookOutput = { continue: true };
    process.stdout.write(JSON.stringify(output));
    return;
  }

  const promptData = readPromptFile(session_id);
  if (!promptData) {
    log(`No prompt file found for session ${session_id}, skipping capture`);
    const output: HookOutput = { continue: true };
    process.stdout.write(JSON.stringify(output));
    return;
  }

  if (!promptData.prompt) {
    log("Stored prompt is empty, skipping capture");
    deletePromptFile(session_id);
    const output: HookOutput = { continue: true };
    process.stdout.write(JSON.stringify(output));
    return;
  }

  // 3. Call Gateway /capture
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    const resp = await fetch(`${GATEWAY_URL}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_content: promptData.prompt,
        assistant_content: last_assistant_message,
        session_key: session_id,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      log(`Capture successful for session ${session_id}`);
      // 4. Delete prompt file after successful capture
      deletePromptFile(session_id);
    } else {
      log(`Gateway /capture returned status ${resp.status}`);
    }
  } catch (err) {
    log(`Gateway /capture failed: ${err}`);
    // Graceful degradation: don't block agent
  }

  // 5. Return success (always continue, even on failure)
  const output: HookOutput = { continue: true };
  process.stdout.write(JSON.stringify(output));
}

main().catch((err) => {
  log(`Unexpected error: ${err}`);
  const output: HookOutput = { continue: true };
  process.stdout.write(JSON.stringify(output));
});
