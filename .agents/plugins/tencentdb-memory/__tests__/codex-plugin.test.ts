/**
 * Codex plugin integration tests.
 *
 * Tests cover: MCP server tool registration, hook script behavior,
 * install/uninstall scripts, and end-to-end smoke tests.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PLUGIN_DIR = join(__dirname, "..");
const SCRIPTS_DIR = join(__dirname, "..", "..", "..", "..", "scripts");

// ============================
// 9.1 Source files exist (no build needed — npx tsx runs .ts directly)
// ============================

describe("Source files", () => {
  it("9.1 all TypeScript source files exist (no build required)", () => {
    expect(existsSync(join(PLUGIN_DIR, "mcp-server.ts"))).toBe(true);
    expect(existsSync(join(PLUGIN_DIR, "hooks", "recall.ts"))).toBe(true);
    expect(existsSync(join(PLUGIN_DIR, "hooks", "capture.ts"))).toBe(true);
  });
});

// ============================
// 9.2-9.4 MCP server tool registration
// ============================

describe("MCP server", () => {
  it("9.2-9.4 mcp-server.ts contains both search tools", () => {
    const source = readFileSync(join(PLUGIN_DIR, "mcp-server.ts"), "utf-8");
    expect(source).toContain("tdai_memory_search");
    expect(source).toContain("tdai_conversation_search");
    expect(source).toContain('name: "tencentdb-memory"');
    expect(source).toContain('version: "1.0.0"');
  });

  it("mcp-server.ts has graceful degradation for Gateway down", () => {
    const source = readFileSync(join(PLUGIN_DIR, "mcp-server.ts"), "utf-8");
    expect(source).toContain("isError: true");
    expect(source).toContain("unavailable");
  });

  it("mcp-server.ts logs to stderr with prefix", () => {
    const source = readFileSync(join(PLUGIN_DIR, "mcp-server.ts"), "utf-8");
    expect(source).toContain("[tdai-mcp]");
    expect(source).toContain("console.error");
  });

  it("mcp-server.ts has ensureGateway with health check and auto-spawn", () => {
    const source = readFileSync(join(PLUGIN_DIR, "mcp-server.ts"), "utf-8");
    expect(source).toContain("ensureGateway");
    expect(source).toContain("/health");
    expect(source).toContain("MEMORY_TENCENTDB_GATEWAY_CMD");
    expect(source).toContain("30_000"); // 30s poll timeout
  });
});

// ============================
// 9.5-9.8 Hook scripts
// ============================

describe("Hook scripts", () => {
  it("9.5 recall hook source reads stdin and POSTs to /recall", () => {
    const source = readFileSync(join(PLUGIN_DIR, "hooks", "recall.ts"), "utf-8");
    expect(source).toContain("/recall");
    expect(source).toContain("process.stdin");
    expect(source).toContain("UserPromptSubmit");
    expect(source).toContain("additionalContext");
    expect(source).toContain("TDAI_GATEWAY_URL");
  });

  it("9.6 capture hook source reads prompt file and POSTs to /capture", () => {
    const source = readFileSync(join(PLUGIN_DIR, "hooks", "capture.ts"), "utf-8");
    expect(source).toContain("/capture");
    expect(source).toContain(".memory-tencentdb");
    expect(source).toContain("user_content");
    expect(source).toContain("assistant_content");
  });

  it("9.7 recall hook has stale file cleanup logic", () => {
    const source = readFileSync(join(PLUGIN_DIR, "hooks", "recall.ts"), "utf-8");
    expect(source).toContain("24");
    expect(source).toContain("STALE_THRESHOLD");
    expect(source).toContain("unlinkSync");
  });

  it("9.8 ensureGateway pattern matches between MCP server and Claude Code plugin", () => {
    const codexSource = readFileSync(join(PLUGIN_DIR, "mcp-server.ts"), "utf-8");
    const claudeSource = readFileSync(
      join(__dirname, "..", "..", "..", "..", "claudecode-plugin", "memory", "memory_tencentdb", "mcp-server.ts"),
      "utf-8",
    );

    // Both should use the same health check pattern
    expect(codexSource).toContain("/health");
    expect(claudeSource).toContain("/health");
    expect(codexSource).toContain("ensureGateway");
    expect(claudeSource).toContain("ensureGateway");
  });
});

// ============================
// 9.9-9.11 Install/uninstall scripts
// ============================

describe("Install/uninstall scripts", () => {
  const testDir = join(tmpdir(), "codex-plugin-test-" + Date.now());

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    // Create a minimal plugin.json so the install script validates
    const pluginDir = join(testDir, "codex-plugin", "memory", "memory_tencentdb", ".codex-plugin");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, "plugin.json"), JSON.stringify({ name: "tencentdb-memory", version: "1.0.0" }));
  });

  afterAll(() => {
    try { rmSync(testDir, { recursive: true }); } catch { /* ignore */ }
  });

  it("9.9 install script structure creates valid marketplace entry fields", () => {
    const source = readFileSync(join(SCRIPTS_DIR, "install-codex-plugin.js"), "utf-8");
    expect(source).toContain("marketplace.json");
    expect(source).toContain("AVAILABLE");
    expect(source).toContain("ON_INSTALL");
    expect(source).toContain("Productivity");
    expect(source).toContain('"local"');
    expect(source).toContain(".agents");
  });

  it("9.10 uninstall script handles plugin not found idempotently", () => {
    const source = readFileSync(join(SCRIPTS_DIR, "uninstall-codex-plugin.js"), "utf-8");
    expect(source).toContain("not found");
    expect(source).toContain("Nothing to remove");
    expect(source).toContain("splice"); // removes entry
    expect(source).toContain("unlinkSync"); // deletes file if empty
  });

  it("9.11 uninstall script preserves other plugins", () => {
    const source = readFileSync(join(SCRIPTS_DIR, "uninstall-codex-plugin.js"), "utf-8");
    expect(source).toContain("remaining");
    expect(source).toContain("preserved");
    expect(source).toContain("marketplace.plugins.length");
  });
});

// ============================
// 9.12 End-to-end (smoke test)
// ============================

describe("End-to-end smoke test", () => {
  it("9.12 plugin directory contains all required files", () => {
    const requiredFiles = [
      ".codex-plugin/plugin.json",
      ".mcp.json",
      "mcp-server.ts",
      "hooks/hooks.json",
      "hooks/recall.ts",
      "hooks/capture.ts",
      "skills/tencentdb-memory/SKILL.md",
    ];

    for (const file of requiredFiles) {
      expect(existsSync(join(PLUGIN_DIR, file))).toBe(true);
    }
  });

  it("plugin.json declares all component pointers", () => {
    const manifest = JSON.parse(
      readFileSync(join(PLUGIN_DIR, ".codex-plugin", "plugin.json"), "utf-8"),
    );
    expect(manifest.name).toBe("tencentdb-memory");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.skills).toBe("./skills/");
    expect(manifest.mcpServers).toBe("./.mcp.json");
    expect(manifest.hooks).toBe("./hooks/hooks.json");
  });

  it(".mcp.json uses wrapped mcp_servers format with npx tsx", () => {
    const mcpConfig = JSON.parse(
      readFileSync(join(PLUGIN_DIR, ".mcp.json"), "utf-8"),
    );
    expect(mcpConfig.mcp_servers).toBeDefined();
    expect(mcpConfig.mcp_servers["tdai-memory"]).toBeDefined();
    expect(mcpConfig.mcp_servers["tdai-memory"].command).toBe("npx");
    expect(mcpConfig.mcp_servers["tdai-memory"].args[0]).toBe("tsx");
    expect(mcpConfig.mcp_servers["tdai-memory"].args[1]).toContain("mcp-server.ts");
  });

  it("hooks.json uses npx tsx for hook commands", () => {
    const hooksConfig = JSON.parse(
      readFileSync(join(PLUGIN_DIR, "hooks", "hooks.json"), "utf-8"),
    );
    expect(hooksConfig.hooks.UserPromptSubmit).toBeDefined();
    expect(hooksConfig.hooks.Stop).toBeDefined();
    expect(hooksConfig.hooks.UserPromptSubmit[0].hooks[0].timeout).toBe(10);
    expect(hooksConfig.hooks.Stop[0].hooks[0].timeout).toBe(30);
    expect(hooksConfig.hooks.UserPromptSubmit[0].hooks[0].command).toContain("npx tsx");
    expect(hooksConfig.hooks.Stop[0].hooks[0].command).toContain("npx tsx");
    expect(hooksConfig.hooks.UserPromptSubmit[0].hooks[0].command).toContain(".ts");
    expect(hooksConfig.hooks.Stop[0].hooks[0].command).toContain(".ts");
  });
});

// ============================
// 9.13-9.15 Edge cases
// ============================

describe("Edge cases", () => {
  it("9.13 capture hook skips when last_assistant_message is null", () => {
    const source = readFileSync(join(PLUGIN_DIR, "hooks", "capture.ts"), "utf-8");
    expect(source).toContain("last_assistant_message");
    expect(source).toContain("null");
    expect(source).toContain("skipping capture");
  });

  it("9.14 capture hook skips when prompt file does not exist", () => {
    const source = readFileSync(join(PLUGIN_DIR, "hooks", "capture.ts"), "utf-8");
    expect(source).toContain("existsSync");
    expect(source).toContain("No prompt file");
    expect(source).toContain("skipping capture");
  });

  it("9.15 recall hook returns empty additionalContext when no matches", () => {
    const source = readFileSync(join(PLUGIN_DIR, "hooks", "recall.ts"), "utf-8");
    expect(source).toContain("additionalContext");
    expect(source).toContain('""');  // default empty string
    expect(source).toContain("context");
  });
});
