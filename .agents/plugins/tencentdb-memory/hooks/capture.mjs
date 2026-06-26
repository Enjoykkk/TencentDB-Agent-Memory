// .agents/plugins/tencentdb-memory/hooks/capture.ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
var GATEWAY_URL = process.env.TDAI_GATEWAY_URL ?? "http://127.0.0.1:8420";
var PROMPTS_DIR = path.join(os.homedir(), ".memory-tencentdb", "prompts");
var HTTP_TIMEOUT_MS = 3e4;
function log(msg) {
  process.stderr.write(`[tdai-capture] ${msg}
`);
}
function readPromptFile(sessionId) {
  const filePath = path.join(PROMPTS_DIR, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function deletePromptFile(sessionId) {
  const filePath = path.join(PROMPTS_DIR, `${sessionId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
  }
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
    const output2 = { continue: true };
    process.stdout.write(JSON.stringify(output2));
    return;
  }
  const { session_id, last_assistant_message } = input;
  if (last_assistant_message === null || last_assistant_message === void 0) {
    log("last_assistant_message is null, skipping capture");
    const output2 = { continue: true };
    process.stdout.write(JSON.stringify(output2));
    return;
  }
  const promptData = readPromptFile(session_id);
  if (!promptData) {
    log(`No prompt file found for session ${session_id}, skipping capture`);
    const output2 = { continue: true };
    process.stdout.write(JSON.stringify(output2));
    return;
  }
  if (!promptData.prompt) {
    log("Stored prompt is empty, skipping capture");
    deletePromptFile(session_id);
    const output2 = { continue: true };
    process.stdout.write(JSON.stringify(output2));
    return;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const resp = await fetch(`${GATEWAY_URL}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_content: promptData.prompt,
        assistant_content: last_assistant_message,
        session_key: session_id
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (resp.ok) {
      log(`Capture successful for session ${session_id}`);
      deletePromptFile(session_id);
    } else {
      log(`Gateway /capture returned status ${resp.status}`);
    }
  } catch (err) {
    log(`Gateway /capture failed: ${err}`);
  }
  const output = { continue: true };
  process.stdout.write(JSON.stringify(output));
}
main().catch((err) => {
  log(`Unexpected error: ${err}`);
  const output = { continue: true };
  process.stdout.write(JSON.stringify(output));
});
