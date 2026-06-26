/**
 * Tests for SessionFilter and isNonInteractiveTrigger.
 */

import { describe, it, expect } from "vitest";
import { SessionFilter, isNonInteractiveTrigger } from "./session-filter.js";
import type { AgentHookContext } from "./session-filter.js";

// ============================
// isNonInteractiveTrigger
// ============================

describe("isNonInteractiveTrigger", () => {
  it("detects 'cron' trigger", () => {
    expect(isNonInteractiveTrigger("cron")).toBe(true);
    expect(isNonInteractiveTrigger("CRON")).toBe(true);
  });

  it("detects 'heartbeat' trigger", () => {
    expect(isNonInteractiveTrigger("heartbeat")).toBe(true);
  });

  it("detects 'automation' trigger", () => {
    expect(isNonInteractiveTrigger("automation")).toBe(true);
  });

  it("detects 'schedule' trigger", () => {
    expect(isNonInteractiveTrigger("schedule")).toBe(true);
  });

  it("returns false for interactive triggers", () => {
    expect(isNonInteractiveTrigger("message")).toBe(false);
    expect(isNonInteractiveTrigger("tool_call")).toBe(false);
  });

  it("returns false when trigger is undefined", () => {
    expect(isNonInteractiveTrigger(undefined)).toBe(false);
    expect(isNonInteractiveTrigger("")).toBe(false);
  });

  it("detects non-interactive patterns in sessionKey", () => {
    expect(isNonInteractiveTrigger(undefined, "agent:my-bot:cron:check")).toBe(true);
    expect(isNonInteractiveTrigger(undefined, "agent:my-bot:heartbeat:poll")).toBe(true);
  });

  it("returns false for normal sessionKeys", () => {
    expect(isNonInteractiveTrigger(undefined, "agent:cli:session-abc")).toBe(false);
    expect(isNonInteractiveTrigger(undefined, "agent:my-bot:message")).toBe(false);
  });
});

// ============================
// SessionFilter
// ============================

describe("SessionFilter", () => {
  // ============================
  // Built-in rules
  // ============================

  describe("built-in rules", () => {
    const filter = new SessionFilter();

    it("skips memory scene extraction sessions", () => {
      expect(filter.shouldSkip("agent:cli:memory-scene-extract-123")).toBe(true);
    });

    it("skips subagent sessions", () => {
      expect(filter.shouldSkip("agent:cli:subagent:helper")).toBe(true);
    });

    it("skips temp: sessions", () => {
      expect(filter.shouldSkip("temp:slug-generator")).toBe(true);
    });

    it("allows normal sessions", () => {
      expect(filter.shouldSkip("agent:cli:session-abc")).toBe(false);
      expect(filter.shouldSkip("agent:my-bot:conversation-1")).toBe(false);
    });
  });

  // ============================
  // User-configured exclude patterns
  // ============================

  describe("user exclude patterns", () => {
    it("skips sessions matching glob patterns", () => {
      const filter = new SessionFilter(["bench-*", "test-*"]);
      expect(filter.shouldSkip("agent:cli:bench-judge-001")).toBe(true);
      expect(filter.shouldSkip("agent:cli:test-runner")).toBe(true);
    });

    it("allows non-matching sessions", () => {
      const filter = new SessionFilter(["bench-*"]);
      expect(filter.shouldSkip("agent:cli:normal-session")).toBe(false);
    });

    it("trims whitespace from patterns", () => {
      const filter = new SessionFilter(["  bench-*  "]);
      expect(filter.shouldSkip("agent:cli:bench-judge-001")).toBe(true);
    });

    it("filters out empty patterns", () => {
      const filter = new SessionFilter(["", "  ", "valid-*"]);
      expect(filter.shouldSkip("agent:cli:valid-session")).toBe(true);
    });

    it("supports wildcards anywhere in the key", () => {
      const filter = new SessionFilter(["*test*"]);
      expect(filter.shouldSkip("agent:cli:test-session")).toBe(true);
      expect(filter.shouldSkip("agent:cli:my-test-runner")).toBe(true);
    });
  });

  // ============================
  // shouldSkipCtx
  // ============================

  describe("shouldSkipCtx", () => {
    const filter = new SessionFilter(["bench-*"]);

    it("returns true when sessionKey is missing", () => {
      const ctx: AgentHookContext = {};
      expect(filter.shouldSkipCtx(ctx)).toBe(true);
    });

    it("returns true when sessionId starts with 'memory-'", () => {
      const ctx: AgentHookContext = {
        sessionKey: "agent:cli:normal",
        sessionId: "memory-extract-001",
      };
      expect(filter.shouldSkipCtx(ctx)).toBe(true);
    });

    it("returns true for non-interactive triggers", () => {
      const ctx: AgentHookContext = {
        sessionKey: "agent:cli:normal",
        trigger: "cron",
      };
      expect(filter.shouldSkipCtx(ctx)).toBe(true);
    });

    it("returns true for excluded sessionKey patterns", () => {
      const ctx: AgentHookContext = {
        sessionKey: "agent:cli:bench-judge-001",
        sessionId: "normal-session",
      };
      expect(filter.shouldSkipCtx(ctx)).toBe(true);
    });

    it("returns false for normal interactive session", () => {
      const ctx: AgentHookContext = {
        sessionKey: "agent:cli:normal-session",
        sessionId: "conv-123",
        trigger: "message",
      };
      expect(filter.shouldSkipCtx(ctx)).toBe(false);
    });
  });

  // ============================
  // Edge cases
  // ============================

  describe("edge cases", () => {
    it("handles empty excludeAgents array", () => {
      const filter = new SessionFilter([]);
      // Should still apply built-in rules
      expect(filter.shouldSkip("agent:cli:subagent:helper")).toBe(true);
      expect(filter.shouldSkip("agent:cli:normal")).toBe(false);
    });

    it("handles patterns with special regex characters", () => {
      const filter = new SessionFilter(["bench.judge+test"]);
      // The + character should be escaped
      expect(filter.shouldSkip("agent:cli:bench.judge+test-run")).toBe(true);
      expect(filter.shouldSkip("agent:cli:benchXjudgeXtest-run")).toBe(false);
    });

    it("handles undefined sessionKey in shouldSkip", () => {
      const filter = new SessionFilter();
      // undefined.toString() would throw, but shouldSkip receives string
      // Testing that it handles edge case keys gracefully
      expect(filter.shouldSkip("")).toBe(false);
    });
  });
});
