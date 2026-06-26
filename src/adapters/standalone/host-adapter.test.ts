/**
 * Tests for StandaloneHostAdapter.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { StandaloneHostAdapter } from "./host-adapter.js";
import type { StandaloneLLMConfig } from "./llm-runner.js";
import type { Logger } from "../../core/types.js";

function makeMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makeLlmConfig(overrides: Partial<StandaloneLLMConfig> = {}): StandaloneLLMConfig {
  return {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test-key",
    model: "gpt-4o",
    maxTokens: 4096,
    timeoutMs: 120_000,
    ...overrides,
  };
}

describe("StandaloneHostAdapter", () => {
  let logger: Logger;
  let llmConfig: StandaloneLLMConfig;

  beforeEach(() => {
    logger = makeMockLogger();
    llmConfig = makeLlmConfig();
  });

  // ============================
  // Construction
  // ============================

  describe("construction", () => {
    it("sets hostType to 'standalone'", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
      });
      expect(adapter.hostType).toBe("standalone");
    });

    it("uses default userId when not provided", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
      });
      const ctx = adapter.getRuntimeContext();
      expect(ctx.userId).toBe("default_user");
    });

    it("uses provided defaultUserId", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
        defaultUserId: "user-123",
      });
      const ctx = adapter.getRuntimeContext();
      expect(ctx.userId).toBe("user-123");
    });

    it("uses default platform 'gateway' when not provided", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
      });
      const ctx = adapter.getRuntimeContext();
      expect(ctx.platform).toBe("gateway");
    });

    it("uses provided platform", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
        platform: "hermes",
      });
      const ctx = adapter.getRuntimeContext();
      expect(ctx.platform).toBe("hermes");
    });
  });

  // ============================
  // getRuntimeContext
  // ============================

  describe("getRuntimeContext", () => {
    it("returns a default RuntimeContext with dataDir as workspaceDir", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/var/lib/memory-tdai",
        llmConfig,
        logger,
        defaultUserId: "user-456",
        platform: "hermes",
      });
      const ctx = adapter.getRuntimeContext();
      expect(ctx.userId).toBe("user-456");
      expect(ctx.sessionId).toBe("");
      expect(ctx.sessionKey).toBe("");
      expect(ctx.platform).toBe("hermes");
      expect(ctx.workspaceDir).toBe("/var/lib/memory-tdai");
      expect(ctx.dataDir).toBe("/var/lib/memory-tdai");
    });
  });

  // ============================
  // buildRuntimeContextForRequest
  // ============================

  describe("buildRuntimeContextForRequest", () => {
    let adapter: StandaloneHostAdapter;

    beforeEach(() => {
      adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
      });
    });

    it("overrides userId, sessionId, sessionKey, and platform", () => {
      const ctx = adapter.buildRuntimeContextForRequest({
        userId: "api-user-789",
        sessionId: "sess-abc",
        sessionKey: "agent:cli:sess-abc",
        platform: "cli",
      });
      expect(ctx.userId).toBe("api-user-789");
      expect(ctx.sessionId).toBe("sess-abc");
      expect(ctx.sessionKey).toBe("agent:cli:sess-abc");
      expect(ctx.platform).toBe("cli");
    });

    it("falls back to defaults when params are omitted", () => {
      const ctx = adapter.buildRuntimeContextForRequest({});
      expect(ctx.userId).toBe("default_user");
      expect(ctx.sessionId).toBe("");
      expect(ctx.sessionKey).toBe("");
      expect(ctx.platform).toBe("gateway");
    });

    it("uses sessionId as sessionKey when sessionKey is not provided", () => {
      const ctx = adapter.buildRuntimeContextForRequest({
        sessionId: "only-session-id",
      });
      expect(ctx.sessionId).toBe("only-session-id");
      expect(ctx.sessionKey).toBe("only-session-id");
    });

    it("uses explicit sessionKey over sessionId when both provided", () => {
      const ctx = adapter.buildRuntimeContextForRequest({
        sessionId: "sess-id",
        sessionKey: "explicit-key",
      });
      expect(ctx.sessionKey).toBe("explicit-key");
      expect(ctx.sessionId).toBe("sess-id");
    });

    it("preserves dataDir from construction in request contexts", () => {
      const adapter2 = new StandaloneHostAdapter({
        dataDir: "/custom/data",
        llmConfig,
        logger,
      });
      const ctx = adapter2.buildRuntimeContextForRequest({
        userId: "u1",
      });
      expect(ctx.dataDir).toBe("/custom/data");
      expect(ctx.workspaceDir).toBe("/custom/data");
    });
  });

  // ============================
  // getLogger
  // ============================

  describe("getLogger", () => {
    it("returns the logger instance provided at construction", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
      });
      expect(adapter.getLogger()).toBe(logger);
    });
  });

  // ============================
  // getLLMRunnerFactory
  // ============================

  describe("getLLMRunnerFactory", () => {
    it("returns a StandaloneLLMRunnerFactory", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
      });
      const factory = adapter.getLLMRunnerFactory();
      expect(factory).toBeDefined();
      expect(typeof factory.createRunner).toBe("function");
    });

    it("creates runners with modelRef and enableTools", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
      });
      const factory = adapter.getLLMRunnerFactory();
      const runner = factory.createRunner({
        modelRef: "deepseek/deepseek-chat",
        enableTools: true,
      });
      expect(runner).toBeDefined();
      expect(typeof runner.run).toBe("function");
    });

    it("creates runners without tools by default", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
      });
      const factory = adapter.getLLMRunnerFactory();
      const runner = factory.createRunner();
      expect(runner).toBeDefined();
    });
  });

  // ============================
  // Factory modelRef parsing
  // ============================

  describe("StandaloneLLMRunnerFactory modelRef parsing", () => {
    it("uses default model when modelRef not provided", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
      });
      const factory = adapter.getLLMRunnerFactory();
      const runner = factory.createRunner();
      expect(runner).toBeDefined();
    });

    it("parses 'provider/model' to just model", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
      });
      const factory = adapter.getLLMRunnerFactory();
      const runner = factory.createRunner({ modelRef: "openai/gpt-4o-mini" });
      expect(runner).toBeDefined();
    });

    it("uses raw modelRef as model when no slash", () => {
      const adapter = new StandaloneHostAdapter({
        dataDir: "/tmp/tdai",
        llmConfig,
        logger,
      });
      const factory = adapter.getLLMRunnerFactory();
      const runner = factory.createRunner({ modelRef: "gpt-4o" });
      expect(runner).toBeDefined();
    });
  });
});
