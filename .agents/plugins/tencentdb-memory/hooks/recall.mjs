// .agents/plugins/tencentdb-memory/hooks/recall.ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
var GATEWAY_URL = process.env.TDAI_GATEWAY_URL ?? "http://127.0.0.1:8420";
var PROMPTS_DIR = path.join(os.homedir(), ".memory-tencentdb", "prompts");
var STALE_THRESHOLD_MS = 24 * 60 * 60 * 1e3;
var HTTP_TIMEOUT_MS = 1e4;
function log(msg) {
  process.stderr.write(`[tdai-recall] ${msg}
`);
}
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function cleanupStaleFiles() {
  if (!fs.existsSync(PROMPTS_DIR)) return;
  const now = Date.now();
  let entries;
  try {
    entries = fs.readdirSync(PROMPTS_DIR, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(PROMPTS_DIR, entry.name);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);
      const ts = data.timestamp ? Date.parse(data.timestamp) : 0;
      if (ts > 0 && now - ts > STALE_THRESHOLD_MS) {
        fs.unlinkSync(filePath);
        log(`Cleaned up stale prompt file: ${entry.name}`);
      }
    } catch {
      try {
        fs.unlinkSync(filePath);
      } catch {
      }
    }
  }
}
function storePrompt(sessionId, prompt) {
  ensureDir(PROMPTS_DIR);
  const filePath = path.join(PROMPTS_DIR, `${sessionId}.json`);
  const data = {
    prompt,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
}
async function main() {
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf-8");
    input = JSON.parse(raw);
  } catch (err) {
    log(`Failed to parse stdin JSON: ${err}`);
    const output2 = {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: ""
      }
    };
    process.stdout.write(JSON.stringify(output2));
    return;
  }
  const { session_id, prompt } = input;
  try {
    storePrompt(session_id, prompt);
  } catch (err) {
    log(`Failed to store prompt file: ${err}`);
  }
  try {
    cleanupStaleFiles();
  } catch (err) {
    log(`Failed to cleanup stale files: ${err}`);
  }
  let additionalContext = "";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const resp = await fetch(`${GATEWAY_URL}/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: prompt,
        session_key: session_id
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const body = await resp.json();
      additionalContext = body.context ?? "";
    } else {
      log(`Gateway /recall returned status ${resp.status}`);
    }
  } catch (err) {
    log(`Gateway /recall failed: ${err}`);
  }
  const output = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext
    }
  };
  process.stdout.write(JSON.stringify(output));
}
main().catch((err) => {
  log(`Unexpected error: ${err}`);
  const output = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: ""
    }
  };
  process.stdout.write(JSON.stringify(output));
});
