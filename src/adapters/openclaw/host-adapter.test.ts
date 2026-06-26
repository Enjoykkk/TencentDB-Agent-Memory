/**
 * Tests for OpenClawHostAdapter.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenClawHostAdapter } from "./host-adapter.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

function makeMockApi(overrides: Partial<OpenClawPluginApi> = {}): OpenClawPluginApi {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    runtime: {
      agent: {
        runEmbeddedPiAgent: vi.fn().mockResolvedValue("mock response"),
      },
    },
    config: {} as any,
    ...overrides,
  } as unknown as OpenClawPluginApi;
}

describe("OpenClawHostAdapter", () => {
  let api: OpenClawPluginApi;

  beforeEach(() => {
    api = makeMockApi();
  });

  // ============================
  // Construction
  // ============================

  describe("construction", () => {
    it("sets hostType to 'openclaw'", () => {
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/tmp/tdai",
        openclawConfig: {},
      });
      expect(adapter.hostType).toBe("openclaw");
    });

    it("creates an OpenClawLLMRunnerFactory internally", () => {
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/tmp/tdai",
        openclawConfig: {},
      });
      const factory = adapter.getLLMRunnerFactory();
      expect(factory).toBeDefined();
      expect(typeof factory.createRunner).toBe("function");
    });
  });

  // ============================
  // getRuntimeContext
  // ============================

  describe("getRuntimeContext", () => {
    it("returns a default RuntimeContext", () => {
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/tmp/tdai",
        openclawConfig: {},
      });
      const ctx = adapter.getRuntimeContext();
      expect(ctx.userId).toBe("default_user");
      expect(ctx.sessionId).toBe("");
      expect(ctx.sessionKey).toBe("");
      expect(ctx.platform).toBe("openclaw");
      expect(ctx.dataDir).toBe("/tmp/tdai");
      expect(ctx.workspaceDir).toBe(process.cwd());
    });
  });

  // ============================
  // buildRuntimeContextForSession
  // ============================

  describe("buildRuntimeContextForSession", () => {
    it("merges sessionKey and sessionId into the base context", () => {
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/tmp/tdai",
        openclawConfig: {},
      });
      const ctx = adapter.buildRuntimeContextForSession("agent:cli:session-abc", "sess-123");
      expect(ctx.sessionKey).toBe("agent:cli:session-abc");
      expect(ctx.sessionId).toBe("sess-123");
      expect(ctx.userId).toBe("default_user"); // inherited from base
      expect(ctx.platform).toBe("openclaw"); // inherited from base
    });

    it("defaults sessionId to empty string when not provided", () => {
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/tmp/tdai",
        openclawConfig: {},
      });
      const ctx = adapter.buildRuntimeContextForSession("agent:cli:session-abc");
      expect(ctx.sessionKey).toBe("agent:cli:session-abc");
      expect(ctx.sessionId).toBe("");
    });
  });

  // ============================
  // getLogger
  // ============================

  describe("getLogger", () => {
    it("returns the logger from the plugin API", () => {
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/tmp/tdai",
        openclawConfig: {},
      });
      const logger = adapter.getLogger();
      expect(logger).toBe(api.logger);
    });
  });

  // ============================
  // getLLMRunnerFactory
  // ============================

  describe("getLLMRunnerFactory", () => {
    it("returns the factory created at construction time", () => {
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/tmp/tdai",
        openclawConfig: {},
      });
      const factory = adapter.getLLMRunnerFactory();
      const runner = factory.createRunner();
      expect(runner).toBeDefined();
      expect(typeof runner.run).toBe("function");
    });

    it("creates runners with modelRef and enableTools options", () => {
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/tmp/tdai",
        openclawConfig: {},
      });
      const factory = adapter.getLLMRunnerFactory();
      const runner = factory.createRunner({
        modelRef: "openai/gpt-4o",
        enableTools: true,
      });
      expect(runner).toBeDefined();
    });
  });

  // ============================
  // OpenClaw-specific accessors
  // ============================

  describe("getPluginApi", () => {
    it("returns the raw plugin API instance", () => {
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/tmp/tdai",
        openclawConfig: {},
      });
      expect(adapter.getPluginApi()).toBe(api);
    });
  });

  describe("getOpenClawConfig", () => {
    it("returns the config passed at construction", () => {
      const config = { models: { providers: {} } };
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/tmp/tdai",
        openclawConfig: config,
      });
      expect(adapter.getOpenClawConfig()).toBe(config);
    });

    it("returns undefined if config was not provided", () => {
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/tmp/tdai",
        openclawConfig: undefined,
      });
      expect(adapter.getOpenClawConfig()).toBeUndefined();
    });
  });

  describe("getPluginDataDir", () => {
    it("returns the plugin data directory", () => {
      const adapter = new OpenClawHostAdapter({
        api,
        pluginDataDir: "/home/user/.openclaw/memory-tdai",
        openclawConfig: {},
      });
      expect(adapter.getPluginDataDir()).toBe("/home/user/.openclaw/memory-tdai");
    });
  });
});
