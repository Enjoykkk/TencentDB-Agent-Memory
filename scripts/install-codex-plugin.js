/**
 * Install the tencentdb-memory plugin into Codex's local marketplace.
 *
 * Copies the plugin directory into ~/.agents/plugins/tencentdb-memory/
 * (keeping source.path within the marketplace root, as required by Codex)
 * and writes the marketplace.json entry.
 *
 * Usage: node scripts/install-codex-plugin.js
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

// ============================
// Configuration
// ============================

const PLUGIN_NAME = "tencentdb-memory";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PLUGIN_SRC_DIR = path.join(
  PROJECT_ROOT,
  "codex-plugin",
  "memory",
  "memory_tencentdb",
);
const MARKETPLACE_DIR = path.join(os.homedir(), ".agents", "plugins");
const MARKETPLACE_FILE = path.join(MARKETPLACE_DIR, "marketplace.json");
const PLUGIN_INSTALL_DIR = path.join(MARKETPLACE_DIR, PLUGIN_NAME);

// ============================
// Helpers
// ============================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Recursively copy a directory.
 */
function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function loadMarketplace() {
  if (!fs.existsSync(MARKETPLACE_FILE)) {
    return { plugins: [] };
  }
  try {
    const raw = fs.readFileSync(MARKETPLACE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(
      `Failed to parse existing marketplace.json: ${err}. Creating new file.`,
    );
    return { plugins: [] };
  }
}

function saveMarketplace(marketplace) {
  ensureDir(MARKETPLACE_DIR);
  fs.writeFileSync(
    MARKETPLACE_FILE,
    JSON.stringify(marketplace, null, 2) + "\n",
    "utf-8",
  );
}

function createPluginEntry() {
  // Codex resolves marketplace paths relative to the marketplace root.
  // On Windows, the root for ~/.agents/plugins/marketplace.json is ~ (home),
  // not ~/.agents/plugins/, so the path must include .agents/plugins/ prefix.
  const relPath = path.relative(os.homedir(), PLUGIN_INSTALL_DIR).split(path.sep).join("/");
  return {
    name: PLUGIN_NAME,
    source: {
      source: "local",
      path: `./${relPath}`,
    },
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_INSTALL",
    },
    category: "Productivity",
  };
}

// ============================
// Run
// ============================

console.log(`Installing ${PLUGIN_NAME} plugin…`);
console.log(`  Plugin source:  ${PLUGIN_SRC_DIR}`);
console.log(`  Plugin install: ${PLUGIN_INSTALL_DIR}`);
console.log(`  Marketplace:    ${MARKETPLACE_FILE}`);

// Verify plugin source exists
if (!fs.existsSync(path.join(PLUGIN_SRC_DIR, ".codex-plugin", "plugin.json"))) {
  console.error(
    `Error: Plugin manifest not found at ${path.join(PLUGIN_SRC_DIR, ".codex-plugin", "plugin.json")}`,
  );
  console.error(
    "Make sure you are running this script from the project root.",
  );
  process.exit(1);
}

// 1. Copy plugin into the marketplace root (Codex requires source.path to stay inside the root)
ensureDir(MARKETPLACE_DIR);
console.log(`Copying plugin to ${PLUGIN_INSTALL_DIR}…`);

// Remove old install if present
if (fs.existsSync(PLUGIN_INSTALL_DIR)) {
  fs.rmSync(PLUGIN_INSTALL_DIR, { recursive: true, force: true });
}
copyDir(PLUGIN_SRC_DIR, PLUGIN_INSTALL_DIR);
// Write a minimal package.json so tsx treats .ts files as ESM
fs.writeFileSync(
  path.join(PLUGIN_INSTALL_DIR, "package.json"),
  JSON.stringify({ type: "module" }, null, 2) + "\n",
  "utf-8",
);

// Bundle .ts → self-contained .mjs from the SOURCE dir (where node_modules is),
// then copy to install dir. This avoids junction resolution issues with esbuild.
const esbuildBin = path.join(PROJECT_ROOT, "node_modules", "esbuild", "bin", "esbuild");

function bundleFile(srcRel, dstRel) {
  const src = path.join(PLUGIN_SRC_DIR, srcRel);
  const dst = path.join(PLUGIN_INSTALL_DIR, dstRel);
  if (!fs.existsSync(esbuildBin) || !fs.existsSync(src)) return false;
  try {
    execSync(
      `node ${JSON.stringify(esbuildBin)} ${JSON.stringify(src)} ` +
        `--outfile=${JSON.stringify(dst)} ` +
        `--bundle --format=esm --platform=node --target=es2023 ` +
        `--external:node:*`,
      { cwd: PROJECT_ROOT, stdio: "pipe", timeout: 30_000 }
    );
    return true;
  } catch (e) {
    console.log(`Bundle failed for ${srcRel}:`, e.stderr?.toString() || e.message);
    return false;
  }
}

if (bundleFile("mcp-server.ts", "mcp-server.mjs")) {
  console.log("Bundled mcp-server.ts → mcp-server.mjs.");
}
if (bundleFile("hooks/recall.ts", "hooks/recall.mjs")) {
  console.log("Bundled hooks/recall.ts → hooks/recall.mjs.");
}
if (bundleFile("hooks/capture.ts", "hooks/capture.mjs")) {
  console.log("Bundled hooks/capture.ts → hooks/capture.mjs.");
}
if (!fs.existsSync(esbuildBin)) {
  console.log("esbuild not found, skipping compilation.");
}

// Link node_modules so compiled .mjs resolves @modelcontextprotocol/sdk & zod
const nodeModulesLink = path.join(PLUGIN_INSTALL_DIR, "node_modules");
const projectNodeModules = path.join(PROJECT_ROOT, "node_modules");
if (fs.existsSync(nodeModulesLink)) {
  try { fs.rmSync(nodeModulesLink, { recursive: true, force: true }); } catch {}
}
try {
  fs.symlinkSync(projectNodeModules, nodeModulesLink,
    process.platform === "win32" ? "junction" : "dir");
  console.log("Linked node_modules → project.");
} catch {
  // Fallback: copy the two required packages
  console.log("Symlink failed, copying required packages…");
  ensureDir(nodeModulesLink);
  for (const pkg of ["@modelcontextprotocol", "zod"]) {
    const src = path.join(projectNodeModules, pkg);
    const dst = path.join(nodeModulesLink, pkg);
    if (fs.existsSync(src)) copyDir(src, dst);
  }
  console.log("Copied @modelcontextprotocol/sdk and zod.");
}
console.log("Copy complete.");

// Patch .mcp.json and hooks.json with absolute paths
// Use forward slashes — Node.js on Windows handles them, and they don't
// need JSON escaping (backslashes in JSON would require \\\\ doubling).
const installPathUnix = PLUGIN_INSTALL_DIR.split(path.sep).join("/");

const mcpJsonPath = path.join(PLUGIN_INSTALL_DIR, ".mcp.json");
const hooksJsonPath = path.join(PLUGIN_INSTALL_DIR, "hooks", "hooks.json");

if (fs.existsSync(mcpJsonPath)) {
  const compiledMjs = path.join(PLUGIN_INSTALL_DIR, "mcp-server.mjs");
  const projectPathUnix = PROJECT_ROOT.split(path.sep).join("/");

  let mcpConfig;
  if (fs.existsSync(compiledMjs)) {
    // Compiled .mjs exists → use plain node (no tsx needed at runtime)
    mcpConfig = {
      mcp_servers: {
        "tdai-memory": {
          command: "node",
          args: [`${installPathUnix}/mcp-server.mjs`],
        },
      },
    };
    console.log("Using compiled mcp-server.mjs.");
  } else {
    // Fallback: node --import tsx/esm with cwd to project
    mcpConfig = {
      mcp_servers: {
        "tdai-memory": {
          command: "node",
          args: ["--import", "tsx/esm", `${installPathUnix}/mcp-server.ts`],
          cwd: projectPathUnix,
        },
      },
    };
    console.log("Using node --import tsx/esm (no compiled .mjs found).");
  }

  fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2) + "\n", "utf-8");
  console.log("Patched .mcp.json.");
}

if (fs.existsSync(hooksJsonPath)) {
  let hooksRaw = fs.readFileSync(hooksJsonPath, "utf-8");
  // Use compiled .mjs if available, otherwise keep .ts with npx tsx
  const recallMjs = path.join(PLUGIN_INSTALL_DIR, "hooks", "recall.mjs");
  if (fs.existsSync(recallMjs)) {
    // Switch from "npx tsx .../recall.ts" to "node .../recall.mjs"
    hooksRaw = hooksRaw.replace(/npx tsx [^\n"]*recall\.ts/g,
      `node ${installPathUnix}/hooks/recall.mjs`);
    hooksRaw = hooksRaw.replace(/npx tsx [^\n"]*capture\.ts/g,
      `node ${installPathUnix}/hooks/capture.mjs`);
    // Also fix commandWindows
    hooksRaw = hooksRaw.replace(/npx tsx [^\n"]*recall\.ts/g,
      `node ${installPathUnix}/hooks/recall.mjs`);
    hooksRaw = hooksRaw.replace(/npx tsx [^\n"]*capture\.ts/g,
      `node ${installPathUnix}/hooks/capture.mjs`);
    // Replace any remaining PLUGIN_ROOT placeholders
    hooksRaw = hooksRaw.replace(/\$\{PLUGIN_ROOT\}/g, installPathUnix);
    hooksRaw = hooksRaw.replace(/%PLUGIN_ROOT%/g, installPathUnix);
    console.log("Patched hooks.json for compiled .mjs.");
  } else {
    hooksRaw = hooksRaw.replace(/\$\{PLUGIN_ROOT\}/g, installPathUnix);
    hooksRaw = hooksRaw.replace(/%PLUGIN_ROOT%/g, installPathUnix);
    console.log("Patched hooks.json with absolute paths (npx tsx).");
  }
  fs.writeFileSync(hooksJsonPath, hooksRaw, "utf-8");
}

// 2. Update marketplace.json
const marketplace = loadMarketplace();

if (!marketplace.plugins) {
  marketplace.plugins = [];
}

// Remove legacy entry with old name if present
const legacyIdx = marketplace.plugins.findIndex((p) => p.name === "memory-tencentdb");
if (legacyIdx >= 0) {
  marketplace.plugins.splice(legacyIdx, 1);
  console.log("Removed legacy 'memory-tencentdb' entry.");
}

const existingIdx = marketplace.plugins.findIndex(
  (p) => p.name === PLUGIN_NAME,
);

const entry = createPluginEntry();

if (existingIdx >= 0) {
  marketplace.plugins[existingIdx] = entry;
  console.log(`Updated existing ${PLUGIN_NAME} entry.`);
} else {
  marketplace.plugins.push(entry);
  console.log(`Added ${PLUGIN_NAME} entry.`);
}

if (!marketplace.name) {
  marketplace.name = "local-codex-plugins";
}

saveMarketplace(marketplace);
console.log(`Marketplace saved to ${MARKETPLACE_FILE}`);
console.log("");

// Try to install via Codex CLI (desktop app auto-discovery is unreliable on Windows)
let cliInstalled = false;
try {
  execSync(`codex plugin add ${PLUGIN_NAME}@local-plugins`, {
    stdio: "pipe",
    timeout: 30_000,
  });
  console.log(`Installed ${PLUGIN_NAME} via Codex CLI.`);
  cliInstalled = true;
} catch {
  // codex CLI not available — user must install from desktop UI
}

console.log("");
console.log("Next steps:");
if (cliInstalled) {
  console.log("  1. Restart Codex");
  console.log("  2. Check Settings → Hooks to review and trust the plugin hooks");
} else {
  console.log("  1. Restart Codex");
  console.log(`  2. Open the plugin directory in Codex and install "${PLUGIN_NAME}" from "本地插件" marketplace`);
  console.log("  3. Review and trust the plugin hooks in Settings → Hooks");
}
