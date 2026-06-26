/**
 * Tests for filename-normalizer (normalizeSceneFilename, isNormalizedSceneFilename).
 */

import { describe, it, expect } from "vitest";
import { normalizeSceneFilename, isNormalizedSceneFilename } from "./filename-normalizer.js";

// ============================
// normalizeSceneFilename
// ============================

describe("normalizeSceneFilename", () => {
  // ============================
  // Basic normalization
  // ============================

  describe("basic normalization", () => {
    it("replaces spaces with hyphens", () => {
      expect(normalizeSceneFilename("Daily Rhythm in Shanghai.md")).toBe(
        "Daily-Rhythm-in-Shanghai.md",
      );
    });

    it("handles multiple spaces/tabs as single hyphen", () => {
      expect(normalizeSceneFilename("Work   Habits  Today.md")).toBe("Work-Habits-Today.md");
    });

    it("strips quotes, brackets, and punctuation", () => {
      expect(normalizeSceneFilename("Coffee (Yirgacheffe).md")).toBe("Coffee-Yirgacheffe.md");
      expect(normalizeSceneFilename('My "Best" Practices.md')).toBe("My-Best-Practices.md");
    });

    it("collapses consecutive hyphens", () => {
      expect(normalizeSceneFilename("test---file.md")).toBe("test-file.md");
    });

    it("collapses consecutive underscores", () => {
      expect(normalizeSceneFilename("test___file.md")).toBe("test_file.md");
    });

    it("collapses consecutive dots", () => {
      expect(normalizeSceneFilename("test...file.md")).toBe("test.file.md");
    });

    it("trims leading/trailing separators", () => {
      expect(normalizeSceneFilename("  spaced  .md")).toBe("spaced.md");
      expect(normalizeSceneFilename("-leading-dash.md")).toBe("leading-dash.md");
      expect(normalizeSceneFilename("trailing-dash-.md")).toBe("trailing-dash.md");
      expect(normalizeSceneFilename("_underscored_.md")).toBe("underscored.md");
      expect(normalizeSceneFilename(".dotted..md")).toBe("dotted.md");
    });
  });

  // ============================
  // CJK handling
  // ============================

  describe("CJK handling", () => {
    it("replaces full-width spaces with hyphens in Chinese", () => {
      expect(normalizeSceneFilename("日常生活　健康管理.md")).toBe("日常生活-健康管理.md");
    });

    it("preserves already normalized CJK filenames", () => {
      expect(normalizeSceneFilename("已经规范.md")).toBe("已经规范.md");
      expect(normalizeSceneFilename("机器学习-最佳实践.md")).toBe("机器学习-最佳实践.md");
    });

    it("normalizes CJK with ASCII punctuation", () => {
      expect(normalizeSceneFilename("技术: TypeScript <高级>.md")).toBe(
        "技术-TypeScript-高级.md",
      );
    });
  });

  // ============================
  // Extension handling
  // ============================

  describe("extension handling", () => {
    it("preserves .md extension as lowercase", () => {
      expect(normalizeSceneFilename("Test.MD")).toBe("Test.md");
      expect(normalizeSceneFilename("TEST.Md")).toBe("TEST.md");
    });

    it("handles .MD extension case-insensitively", () => {
      expect(normalizeSceneFilename("UPPER.mD")).toBe("UPPER.md");
    });

    it("adds .md when file has no extension", () => {
      expect(normalizeSceneFilename("just-name")).toBe("just-name.md");
    });

    it("does not double-add .md", () => {
      expect(normalizeSceneFilename("file.md.md")).toBe("file.md.md");
    });
  });

  // ============================
  // Fallback
  // ============================

  describe("fallback", () => {
    it("returns 'scene.md' for empty string", () => {
      expect(normalizeSceneFilename("")).toBe("scene.md");
    });

    it("returns 'scene.md' when stem collapses to empty", () => {
      expect(normalizeSceneFilename(".MD")).toBe("scene.md");
    });

    it("returns 'scene.md' when all chars are stripped", () => {
      expect(normalizeSceneFilename("[]{}()<>.md")).toBe("scene.md");
    });
  });

  // ============================
  // Path handling
  // ============================

  describe("path handling", () => {
    it("strips directory components and keeps basename", () => {
      expect(normalizeSceneFilename("/path/to/Daily Rhythm.md")).toBe("Daily-Rhythm.md");
      expect(normalizeSceneFilename("subdir/Test File.md")).toBe("Test-File.md");
    });

    it("handles Windows-style paths", () => {
      expect(normalizeSceneFilename("C:\\Users\\test\\My Scene.md")).toBe("My-Scene.md");
    });
  });

  // ============================
  // Special characters
  // ============================

  describe("special characters", () => {
    it("strips semicolons, colons, and exclamation marks", () => {
      expect(normalizeSceneFilename("Important: Note!.md")).toBe("Important-Note.md");
    });

    it("strips question marks and asterisks", () => {
      expect(normalizeSceneFilename("What* is this?.md")).toBe("What-is-this.md");
    });

    it("strips pipe character", () => {
      expect(normalizeSceneFilename("a|b.md")).toBe("ab.md");
    });

    it("treats forward slash as directory separator (strips to basename)", () => {
      expect(normalizeSceneFilename("path/to/file.md")).toBe("file.md");
    });

    it("strips equals, ampersand, percent, dollar, hash, at, caret, tilde, plus", () => {
      expect(normalizeSceneFilename("a=b&c%d$e#f@g^h~i+j.md")).toBe("abcdefghij.md");
    });

    it("preserves unicode letters, numbers, hyphens, underscores, dots", () => {
      expect(normalizeSceneFilename("Café-Naïve_v2.0.md")).toBe("Café-Naïve_v2.0.md");
    });
  });

  // ============================
  // NBSP handling
  // ============================

  describe("NBSP handling", () => {
    it("replaces non-breaking spaces with hyphens", () => {
      const nbsp = " ";
      expect(normalizeSceneFilename(`word${nbsp}word.md`)).toBe("word-word.md");
    });
  });

  // ============================
  // isNormalizedSceneFilename
  // ============================

  describe("isNormalizedSceneFilename", () => {
    it("returns true for already-normalized names", () => {
      expect(isNormalizedSceneFilename("daily-routine.md")).toBe(true);
      expect(isNormalizedSceneFilename("Work-Habits.md")).toBe(true);
      expect(isNormalizedSceneFilename("机器学习.md")).toBe(true);
    });

    it("returns false for names needing normalization", () => {
      expect(isNormalizedSceneFilename("Daily Rhythm.md")).toBe(false);
      expect(isNormalizedSceneFilename("Test (File).md")).toBe(false);
      expect(isNormalizedSceneFilename("  spaced  .md")).toBe(false);
    });
  });
});
