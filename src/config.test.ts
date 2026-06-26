/**
 * Comprehensive tests for parseConfig (MemoryTdaiConfig parser).
 */

import { describe, it, expect } from "vitest";
import { parseConfig } from "./config.js";
import type { MemoryTdaiConfig } from "./config.js";

describe("parseConfig", () => {
  // ============================
  // Empty / minimal config
  // ============================

  describe("empty / minimal config", () => {
    it("returns all defaults with empty input", () => {
      const cfg = parseConfig({});
      expect(cfg.timezone).toBe("system");
      expect(cfg.capture.enabled).toBe(true);
      expect(cfg.extraction.enabled).toBe(true);
      expect(cfg.storeBackend).toBe("sqlite");
    });

    it("returns defaults when input is undefined", () => {
      const cfg = parseConfig(undefined);
      expect(cfg.timezone).toBe("system");
    });

    it("returns defaults for null input (treated as empty object)", () => {
      // parseConfig casts null to empty object via (c ?? {})
      const cfg = parseConfig(null as unknown as Record<string, unknown>);
      expect(cfg.capture.enabled).toBe(true);
    });
  });

  // ============================
  // Timezone
  // ============================

  describe("timezone", () => {
    it("defaults to 'system'", () => {
      expect(parseConfig({}).timezone).toBe("system");
    });

    it("accepts IANA timezone", () => {
      expect(parseConfig({ timezone: "Asia/Shanghai" }).timezone).toBe("Asia/Shanghai");
    });

    it("accepts offset string", () => {
      expect(parseConfig({ timezone: "+08:00" }).timezone).toBe("+08:00");
    });
  });

  // ============================
  // Capture
  // ============================

  describe("capture", () => {
    it("enabled by default", () => {
      expect(parseConfig({}).capture.enabled).toBe(true);
    });

    it("can disable capture", () => {
      expect(parseConfig({ capture: { enabled: false } }).capture.enabled).toBe(false);
    });

    it("parses excludeAgents as string array (no trimming)", () => {
      const cfg = parseConfig({ capture: { excludeAgents: ["bench-*"] } });
      expect(cfg.capture.excludeAgents).toEqual(["bench-*"]);
    });

    it("defaults excludeAgents to empty array", () => {
      expect(parseConfig({}).capture.excludeAgents).toEqual([]);
    });

    it("defaults l0l1RetentionDays to 0 (disabled)", () => {
      expect(parseConfig({}).capture.l0l1RetentionDays).toBe(0);
    });

    it("accepts retention >= 3 days", () => {
      const cfg = parseConfig({ capture: { l0l1RetentionDays: 7 } });
      expect(cfg.capture.l0l1RetentionDays).toBe(7);
      expect(cfg.memoryCleanup.enabled).toBe(true);
    });

    it("rejects retention 1-2 days without allowAggressiveCleanup", () => {
      const cfg = parseConfig({ capture: { l0l1RetentionDays: 2 } });
      expect(cfg.capture.l0l1RetentionDays).toBe(0);
      expect(cfg.memoryCleanup.enabled).toBe(false);
    });

    it("accepts retention 1-2 days with allowAggressiveCleanup", () => {
      const cfg = parseConfig({
        capture: { l0l1RetentionDays: 1, allowAggressiveCleanup: true },
      });
      expect(cfg.capture.l0l1RetentionDays).toBe(1);
      expect(cfg.capture.allowAggressiveCleanup).toBe(true);
      expect(cfg.memoryCleanup.enabled).toBe(true);
    });
  });

  // ============================
  // Extraction
  // ============================

  describe("extraction", () => {
    it("defaults", () => {
      const cfg = parseConfig({});
      expect(cfg.extraction.enabled).toBe(true);
      expect(cfg.extraction.enableDedup).toBe(true);
      expect(cfg.extraction.maxMemoriesPerSession).toBe(20);
      expect(cfg.extraction.model).toBeUndefined();
    });

    it("accepts custom values", () => {
      const cfg = parseConfig({
        extraction: {
          enabled: false,
          enableDedup: false,
          maxMemoriesPerSession: 50,
          model: "openai/gpt-4o-mini",
        },
      });
      expect(cfg.extraction.enabled).toBe(false);
      expect(cfg.extraction.enableDedup).toBe(false);
      expect(cfg.extraction.maxMemoriesPerSession).toBe(50);
      expect(cfg.extraction.model).toBe("openai/gpt-4o-mini");
    });
  });

  // ============================
  // Persona
  // ============================

  describe("persona", () => {
    it("defaults", () => {
      const cfg = parseConfig({});
      expect(cfg.persona.triggerEveryN).toBe(50);
      expect(cfg.persona.maxScenes).toBe(15);
      expect(cfg.persona.backupCount).toBe(3);
      expect(cfg.persona.sceneBackupCount).toBe(10);
      expect(cfg.persona.model).toBeUndefined();
    });

    it("accepts custom values", () => {
      const cfg = parseConfig({
        persona: { triggerEveryN: 30, maxScenes: 20, backupCount: 5 },
      });
      expect(cfg.persona.triggerEveryN).toBe(30);
      expect(cfg.persona.maxScenes).toBe(20);
      expect(cfg.persona.backupCount).toBe(5);
    });
  });

  // ============================
  // Pipeline
  // ============================

  describe("pipeline", () => {
    it("defaults", () => {
      const cfg = parseConfig({});
      expect(cfg.pipeline.everyNConversations).toBe(5);
      expect(cfg.pipeline.enableWarmup).toBe(true);
      expect(cfg.pipeline.l1IdleTimeoutSeconds).toBe(600);
      expect(cfg.pipeline.l2DelayAfterL1Seconds).toBe(10);
      expect(cfg.pipeline.l2MinIntervalSeconds).toBe(900);
      expect(cfg.pipeline.l2MaxIntervalSeconds).toBe(3600);
      expect(cfg.pipeline.sessionActiveWindowHours).toBe(24);
    });

    it("accepts custom values", () => {
      const cfg = parseConfig({
        pipeline: {
          everyNConversations: 10,
          enableWarmup: false,
          l1IdleTimeoutSeconds: 300,
        },
      });
      expect(cfg.pipeline.everyNConversations).toBe(10);
      expect(cfg.pipeline.enableWarmup).toBe(false);
      expect(cfg.pipeline.l1IdleTimeoutSeconds).toBe(300);
    });
  });

  // ============================
  // Recall
  // ============================

  describe("recall", () => {
    it("defaults", () => {
      const cfg = parseConfig({});
      expect(cfg.recall.enabled).toBe(true);
      expect(cfg.recall.maxResults).toBe(5);
      expect(cfg.recall.maxCharsPerMemory).toBe(0);
      expect(cfg.recall.maxTotalRecallChars).toBe(0);
      expect(cfg.recall.scoreThreshold).toBe(0.3);
      expect(cfg.recall.strategy).toBe("hybrid");
      expect(cfg.recall.timeoutMs).toBe(5000);
    });

    it("validates strategy against whitelist", () => {
      expect(parseConfig({ recall: { strategy: "embedding" } }).recall.strategy).toBe("embedding");
      expect(parseConfig({ recall: { strategy: "keyword" } }).recall.strategy).toBe("keyword");
      expect(parseConfig({ recall: { strategy: "hybrid" } }).recall.strategy).toBe("hybrid");
    });

    it("falls back to 'hybrid' for invalid strategy", () => {
      const cfg = parseConfig({ recall: { strategy: "invalid" } });
      expect(cfg.recall.strategy).toBe("hybrid");
    });

    it("falls back to 'hybrid' for empty strategy string", () => {
      const cfg = parseConfig({ recall: { strategy: "" } });
      expect(cfg.recall.strategy).toBe("hybrid");
    });
  });

  // ============================
  // Embedding
  // ============================

  describe("embedding", () => {
    it("disabled by default (provider='none')", () => {
      const cfg = parseConfig({});
      expect(cfg.embedding.enabled).toBe(false);
      expect(cfg.embedding.provider).toBe("none");
      expect(cfg.embedding.dimensions).toBe(0);
      expect(cfg.embedding.model).toBe("");
    });

    it("stays disabled for provider='none'", () => {
      const cfg = parseConfig({ embedding: { provider: "none" } });
      expect(cfg.embedding.enabled).toBe(false);
      expect(cfg.embedding.provider).toBe("none");
    });

    it("requires all fields for remote provider", () => {
      const cfg = parseConfig({
        embedding: {
          provider: "openai",
          apiKey: "sk-dummy",
          baseUrl: "https://api.openai.com/v1",
          model: "text-embedding-3-small",
          dimensions: 1536,
        },
      });
      expect(cfg.embedding.enabled).toBe(true);
      expect(cfg.embedding.provider).toBe("openai");
      expect(cfg.embedding.dimensions).toBe(1536);
    });

    it("disables embedding when remote provider is missing fields", () => {
      const cfg = parseConfig({
        embedding: {
          provider: "deepseek",
          apiKey: "sk-dummy",
        },
      });
      expect(cfg.embedding.enabled).toBe(false);
      expect(cfg.embedding.configError).toBeDefined();
      expect(cfg.embedding.configError).toContain("Missing");
    });

    it("treats 'local' provider as disabled (not exposed to users)", () => {
      const cfg = parseConfig({ embedding: { provider: "local" } });
      expect(cfg.embedding.enabled).toBe(false);
      expect(cfg.embedding.provider).toBe("none");
    });

    it("validates qclaw provider requires proxyUrl", () => {
      const cfg = parseConfig({
        embedding: {
          provider: "qclaw",
          apiKey: "sk-dummy",
          baseUrl: "https://example.com",
          model: "bge-large-zh",
          dimensions: 1024,
          proxyUrl: "http://localhost:8080",
        },
      });
      expect(cfg.embedding.provider).toBe("qclaw");
      expect(cfg.embedding.enabled).toBe(true);
    });

    it("disables qclaw provider when missing proxyUrl", () => {
      const cfg = parseConfig({
        embedding: {
          provider: "qclaw",
          apiKey: "sk-dummy",
          baseUrl: "https://example.com",
          model: "bge-large-zh",
          dimensions: 1024,
        },
      });
      expect(cfg.embedding.enabled).toBe(false);
      expect(cfg.embedding.configError).toContain("proxyUrl");
    });

    it("defaults sendDimensions to true", () => {
      expect(parseConfig({}).embedding.sendDimensions).toBe(true);
    });

    it("accepts sendDimensions = false", () => {
      const cfg = parseConfig({
        embedding: {
          provider: "openai",
          apiKey: "sk-dummy",
          baseUrl: "https://api.openai.com/v1",
          model: "text-embedding-3-small",
          dimensions: 1536,
          sendDimensions: false,
        },
      });
      expect(cfg.embedding.sendDimensions).toBe(false);
    });
  });

  // ============================
  // Store backend
  // ============================

  describe("storeBackend", () => {
    it("defaults to 'sqlite'", () => {
      expect(parseConfig({}).storeBackend).toBe("sqlite");
    });

    it("accepts 'tcvdb'", () => {
      expect(parseConfig({ storeBackend: "tcvdb" }).storeBackend).toBe("tcvdb");
    });

    it("falls back to 'sqlite' for unknown backend", () => {
      expect(parseConfig({ storeBackend: "unknown" }).storeBackend).toBe("sqlite");
    });
  });

  // ============================
  // TCVDB config
  // ============================

  describe("tcvdb", () => {
    it("defaults", () => {
      const cfg = parseConfig({});
      expect(cfg.tcvdb.url).toBe("");
      expect(cfg.tcvdb.username).toBe("root");
      expect(cfg.tcvdb.apiKey).toBe("");
      expect(cfg.tcvdb.database).toBe("");
      expect(cfg.tcvdb.embeddingModel).toBe("bge-large-zh");
      expect(cfg.tcvdb.timeout).toBe(10000);
    });

    it("accepts custom config", () => {
      const cfg = parseConfig({
        tcvdb: {
          url: "http://10.0.1.1:80",
          username: "admin",
          apiKey: "secret",
          database: "memory_db",
          embeddingModel: "bge-large-en",
          timeout: 15000,
        },
      });
      expect(cfg.tcvdb.url).toBe("http://10.0.1.1:80");
      expect(cfg.tcvdb.username).toBe("admin");
      expect(cfg.tcvdb.database).toBe("memory_db");
      expect(cfg.tcvdb.embeddingModel).toBe("bge-large-en");
      expect(cfg.tcvdb.timeout).toBe(15000);
    });
  });

  // ============================
  // BM25
  // ============================

  describe("bm25", () => {
    it("defaults to enabled, language zh", () => {
      const cfg = parseConfig({});
      expect(cfg.bm25.enabled).toBe(true);
      expect(cfg.bm25.language).toBe("zh");
    });

    it("accepts language en", () => {
      const cfg = parseConfig({ bm25: { language: "en" } });
      expect(cfg.bm25.language).toBe("en");
    });

    it("defaults unknown languages to zh", () => {
      const cfg = parseConfig({ bm25: { language: "fr" } });
      // Falls back to zh for unknown languages
      expect(cfg.bm25.language).toBe("zh");
    });

    it("can disable bm25", () => {
      const cfg = parseConfig({ bm25: { enabled: false } });
      expect(cfg.bm25.enabled).toBe(false);
    });
  });

  // ============================
  // Memory cleanup
  // ============================

  describe("memoryCleanup", () => {
    it("disabled by default", () => {
      const cfg = parseConfig({});
      expect(cfg.memoryCleanup.enabled).toBe(false);
      expect(cfg.memoryCleanup.retentionDays).toBeUndefined();
      expect(cfg.memoryCleanup.cleanTime).toBe("03:00");
    });

    it("accepts custom cleanTime", () => {
      const cfg = parseConfig({
        capture: { l0l1RetentionDays: 30 },
      });
      expect(cfg.memoryCleanup.enabled).toBe(true);
      expect(cfg.memoryCleanup.cleanTime).toBe("03:00");
    });
  });

  // ============================
  // Report
  // ============================

  describe("report", () => {
    it("disabled by default", () => {
      const cfg = parseConfig({});
      expect(cfg.report.enabled).toBe(false);
      expect(cfg.report.type).toBe("local");
    });

    it("can be enabled", () => {
      const cfg = parseConfig({ report: { enabled: true, type: "local" } });
      expect(cfg.report.enabled).toBe(true);
    });
  });

  // ============================
  // Standalone LLM override
  // ============================

  describe("llm (standalone override)", () => {
    it("disabled by default", () => {
      expect(parseConfig({}).llm.enabled).toBe(false);
    });

    it("defaults to gpt-4o model", () => {
      expect(parseConfig({}).llm.model).toBe("gpt-4o");
      expect(parseConfig({}).llm.baseUrl).toBe("https://api.openai.com/v1");
      expect(parseConfig({}).llm.maxTokens).toBe(4096);
      expect(parseConfig({}).llm.timeoutMs).toBe(120_000);
      expect(parseConfig({}).llm.disableThinking).toBe(false);
    });

    it("accepts custom LLM config", () => {
      const cfg = parseConfig({
        llm: {
          enabled: true,
          baseUrl: "https://api.deepseek.com/v1",
          apiKey: "sk-deepseek",
          model: "deepseek-chat",
          maxTokens: 8192,
          timeoutMs: 60000,
          disableThinking: "deepseek",
        },
      });
      expect(cfg.llm.enabled).toBe(true);
      expect(cfg.llm.baseUrl).toBe("https://api.deepseek.com/v1");
      expect(cfg.llm.model).toBe("deepseek-chat");
      expect(cfg.llm.maxTokens).toBe(8192);
      expect(cfg.llm.timeoutMs).toBe(60000);
      expect(cfg.llm.disableThinking).toBe("deepseek");
    });

    it("normalizes disableThinking boolean true to 'vllm'", () => {
      const cfg = parseConfig({
        llm: { enabled: true, disableThinking: true },
      });
      expect(cfg.llm.disableThinking).toBe("vllm");
    });
  });

  // ============================
  // Offload
  // ============================

  describe("offload", () => {
    it("disabled by default", () => {
      expect(parseConfig({}).offload.enabled).toBe(false);
    });

    it("defaults", () => {
      const cfg = parseConfig({});
      expect(cfg.offload.mode).toBe("local");
      expect(cfg.offload.temperature).toBe(0.2);
      expect(cfg.offload.forceTriggerThreshold).toBe(4);
      expect(cfg.offload.defaultContextWindow).toBe(200000);
      expect(cfg.offload.maxPairsPerBatch).toBe(20);
      expect(cfg.offload.l2NullThreshold).toBe(4);
      expect(cfg.offload.l2TimeoutSeconds).toBe(300);
      expect(cfg.offload.mildOffloadRatio).toBe(0.5);
      expect(cfg.offload.aggressiveCompressRatio).toBe(0.85);
      expect(cfg.offload.mmdMaxTokenRatio).toBe(0.2);
      expect(cfg.offload.backendTimeoutMs).toBe(120000);
      expect(cfg.offload.offloadRetentionDays).toBe(0);
      expect(cfg.offload.logMaxSizeMb).toBe(50);
    });

    it("auto-detects mode as 'backend' when backendUrl is set", () => {
      const cfg = parseConfig({
        offload: { enabled: true, backendUrl: "https://backend.example.com" },
      });
      expect(cfg.offload.mode).toBe("backend");
    });

    it("explicit mode overrides auto-detection", () => {
      const cfg = parseConfig({
        offload: {
          enabled: true,
          mode: "collect",
          backendUrl: "https://backend.example.com",
        },
      });
      expect(cfg.offload.mode).toBe("collect");
    });

    it("validates offload retention days (0-2 forced to 0)", () => {
      expect(parseConfig({ offload: { offloadRetentionDays: -1 } }).offload.offloadRetentionDays).toBe(0);
      expect(parseConfig({ offload: { offloadRetentionDays: 0 } }).offload.offloadRetentionDays).toBe(0);
      expect(parseConfig({ offload: { offloadRetentionDays: 2 } }).offload.offloadRetentionDays).toBe(0);
      expect(parseConfig({ offload: { offloadRetentionDays: 3 } }).offload.offloadRetentionDays).toBe(3);
      expect(parseConfig({ offload: { offloadRetentionDays: 90 } }).offload.offloadRetentionDays).toBe(90);
    });
  });

  // ============================
  // Edge cases
  // ============================

  describe("edge cases", () => {
    it("handles deeply nested empty objects", () => {
      const cfg = parseConfig({
        capture: {},
        extraction: {},
        persona: {},
        pipeline: {},
        recall: {},
        embedding: {},
        tcvdb: {},
        bm25: {},
        llm: {},
        offload: {},
      });
      // Should all resolve to defaults without throwing
      expect(cfg.capture.enabled).toBe(true);
      expect(cfg.extraction.enabled).toBe(true);
    });

    it("filters out empty strings from excludeAgents", () => {
      const cfg = parseConfig({
        capture: {
          excludeAgents: ["", "valid-agent"],
        },
      });
      // Empty strings are filtered, but values are not trimmed
      expect(cfg.capture.excludeAgents).toEqual(["valid-agent"]);
    });
  });

  // ============================
  // normalizeCleanTime (via memoryCleanup.cleanTime)
  // ============================

  describe("cleanTime normalization", () => {
    it("defaults to '03:00'", () => {
      expect(parseConfig({}).memoryCleanup.cleanTime).toBe("03:00");
    });

    it("normalizes H:MM to HH:MM", () => {
      const cfg = parseConfig({
        capture: { cleanTime: "3:05", l0l1RetentionDays: 7 },
      });
      expect(cfg.memoryCleanup.cleanTime).toBe("03:05");
    });

    it("keeps already normalized HH:MM", () => {
      const cfg = parseConfig({
        capture: { cleanTime: "23:59", l0l1RetentionDays: 7 },
      });
      expect(cfg.memoryCleanup.cleanTime).toBe("23:59");
    });

    it("rejects invalid hour (24:00)", () => {
      const cfg = parseConfig({
        capture: { cleanTime: "24:00", l0l1RetentionDays: 7 },
      });
      expect(cfg.memoryCleanup.cleanTime).toBe("03:00");
    });

    it("rejects invalid minute (12:60)", () => {
      const cfg = parseConfig({
        capture: { cleanTime: "12:60", l0l1RetentionDays: 7 },
      });
      expect(cfg.memoryCleanup.cleanTime).toBe("03:00");
    });
  });
});
