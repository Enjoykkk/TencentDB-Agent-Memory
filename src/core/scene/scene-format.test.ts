/**
 * Tests for scene-format (parseSceneBlock, formatSceneBlock, formatMeta).
 */

import { describe, it, expect } from "vitest";
import { parseSceneBlock, formatSceneBlock, formatMeta } from "./scene-format.js";
import type { SceneBlockMeta } from "./scene-format.js";

// ============================
// formatMeta
// ============================

describe("formatMeta", () => {
  it("formats a META block with all fields", () => {
    const meta: SceneBlockMeta = {
      created: "2026-01-15T10:30:00Z",
      updated: "2026-02-20T14:00:00Z",
      summary: "Daily routine in Shanghai",
      heat: 5,
    };
    const result = formatMeta(meta);
    expect(result).toContain("-----META-START-----");
    expect(result).toContain("created: 2026-01-15T10:30:00Z");
    expect(result).toContain("updated: 2026-02-20T14:00:00Z");
    expect(result).toContain("summary: Daily routine in Shanghai");
    expect(result).toContain("heat: 5");
    expect(result).toContain("-----META-END-----");
  });

  it("handles empty fields", () => {
    const meta: SceneBlockMeta = {
      created: "",
      updated: "",
      summary: "",
      heat: 0,
    };
    const result = formatMeta(meta);
    expect(result).toContain("created: ");
    expect(result).toContain("summary: ");
    expect(result).toContain("heat: 0");
  });

  it("handles heat value of 0 specifically", () => {
    const meta: SceneBlockMeta = {
      created: "2026-01-01",
      updated: "2026-01-01",
      summary: "test",
      heat: 0,
    };
    const result = formatMeta(meta);
    expect(result).toContain("heat: 0");
  });
});

// ============================
// formatSceneBlock
// ============================

describe("formatSceneBlock", () => {
  it("formats META + content with newline separator", () => {
    const meta: SceneBlockMeta = {
      created: "2026-03-01",
      updated: "2026-03-15",
      summary: "Work habits",
      heat: 3,
    };
    const content = "The user prefers morning meetings and uses TypeScript daily.";
    const result = formatSceneBlock(meta, content);

    expect(result).toContain("-----META-START-----");
    expect(result).toContain("-----META-END-----");
    expect(result).toContain("Work habits");
    expect(result).toContain("The user prefers morning meetings");
  });

  it("preserves multiline content", () => {
    const meta: SceneBlockMeta = {
      created: "2026-01-01",
      updated: "2026-01-01",
      summary: "Multi-line",
      heat: 1,
    };
    const content = "Line 1\nLine 2\nLine 3";
    const result = formatSceneBlock(meta, content);
    expect(result).toContain("Line 1\nLine 2\nLine 3");
  });
});

// ============================
// parseSceneBlock
// ============================

describe("parseSceneBlock", () => {
  it("parses a valid scene block with META section", () => {
    const raw = [
      "-----META-START-----",
      "created: 2026-01-15T10:30:00Z",
      "updated: 2026-02-20T14:00:00Z",
      "summary: Daily routine in Shanghai",
      "heat: 5",
      "-----META-END-----",
      "",
      "The user wakes up at 7 AM and starts work at 9 AM.",
    ].join("\n");

    const block = parseSceneBlock(raw, "daily-routine.md");

    expect(block.filename).toBe("daily-routine.md");
    expect(block.meta.created).toBe("2026-01-15T10:30:00Z");
    expect(block.meta.updated).toBe("2026-02-20T14:00:00Z");
    expect(block.meta.summary).toBe("Daily routine in Shanghai");
    expect(block.meta.heat).toBe(5);
    expect(block.content).toBe("The user wakes up at 7 AM and starts work at 9 AM.");
  });

  it("parses block without META section (treats entire file as content)", () => {
    const raw = "Just plain content without any META markers.";

    const block = parseSceneBlock(raw, "plain.md");

    expect(block.filename).toBe("plain.md");
    expect(block.meta.created).toBe("");
    expect(block.meta.updated).toBe("");
    expect(block.meta.summary).toBe("");
    expect(block.meta.heat).toBe(0);
    expect(block.content).toBe("Just plain content without any META markers.");
  });

  it("parses block with only META-START (no META-END)", () => {
    const raw = "-----META-START-----\ncreated: test\nSome content";
    const block = parseSceneBlock(raw, "partial.md");
    // Missing META-END → treated as no META section
    expect(block.meta.created).toBe("");
    expect(block.content).toBe(raw.trim());
  });

  it("parses block with only META-END (no META-START)", () => {
    const raw = "Content\n-----META-END-----";
    const block = parseSceneBlock(raw, "partial.md");
    // Missing META-START → treated as no META section
    expect(block.meta.created).toBe("");
  });

  it("handles empty heat value gracefully (falls back to 0)", () => {
    const raw = [
      "-----META-START-----",
      "created: 2026-01-01",
      "updated: 2026-01-01",
      "summary: test",
      "heat: ",
      "-----META-END-----",
      "",
      "content",
    ].join("\n");

    const block = parseSceneBlock(raw, "test.md");
    expect(block.meta.heat).toBe(0);
  });

  it("handles non-numeric heat value gracefully", () => {
    const raw = [
      "-----META-START-----",
      "created: 2026-01-01",
      "updated: 2026-01-01",
      "summary: test",
      "heat: abc",
      "-----META-END-----",
      "",
      "content",
    ].join("\n");

    const block = parseSceneBlock(raw, "test.md");
    // parseInt("abc", 10) returns NaN → || 0 → 0
    expect(block.meta.heat).toBe(0);
  });

  it("handles extra whitespace in META fields", () => {
    const raw = [
      "-----META-START-----",
      "created:   2026-01-01  ",
      "updated:  2026-02-01",
      "summary:  padded summary  ",
      "heat:  10  ",
      "-----META-END-----",
      "",
      "content",
    ].join("\n");

    const block = parseSceneBlock(raw, "padded.md");
    expect(block.meta.created).toBe("2026-01-01");
    expect(block.meta.summary).toBe("padded summary");
    expect(block.meta.heat).toBe(10);
  });

  it("handles empty input", () => {
    const block = parseSceneBlock("", "empty.md");
    expect(block.filename).toBe("empty.md");
    expect(block.meta.heat).toBe(0);
    expect(block.content).toBe("");
  });

  it("handles content with embedded META-like text", () => {
    // META markers in content after the real META section should be preserved
    const raw = [
      "-----META-START-----",
      "created: 2026-01-01",
      "updated: 2026-01-01",
      "summary: test",
      "heat: 1",
      "-----META-END-----",
      "",
      "Content mentioning -----META-START----- in text.",
    ].join("\n");

    const block = parseSceneBlock(raw, "embedded.md");
    // Only the first META-START/END pair should be parsed as meta
    expect(block.meta.summary).toBe("test");
    expect(block.content).toContain("-----META-START-----");
  });

  it("round-trips: format → parse produces the same data", () => {
    const original: SceneBlockMeta = {
      created: "2026-06-15T08:00:00Z",
      updated: "2026-07-01T12:00:00Z",
      summary: "Work preferences and habits",
      heat: 7,
    };
    const content = "The user prefers async communication and uses Notion for task tracking.";

    const formatted = formatSceneBlock(original, content);
    const parsed = parseSceneBlock(formatted, "work-habits.md");

    expect(parsed.meta.created).toBe(original.created);
    expect(parsed.meta.updated).toBe(original.updated);
    expect(parsed.meta.summary).toBe(original.summary);
    expect(parsed.meta.heat).toBe(original.heat);
    expect(parsed.content).toBe(content);
  });
});
