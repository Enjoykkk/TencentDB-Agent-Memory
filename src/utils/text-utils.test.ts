/**
 * Tests for text-utils (extractWords).
 */

import { describe, it, expect } from "vitest";
import { extractWords } from "./text-utils.js";

describe("extractWords", () => {
  // ============================
  // Latin words
  // ============================

  describe("latin words", () => {
    it("extracts lowercase latin words (2+ chars)", () => {
      const words = extractWords("Hello World TypeScript");
      expect(words.has("hello")).toBe(true);
      expect(words.has("world")).toBe(true);
      expect(words.has("typescript")).toBe(true);
    });

    it("extracts words with numbers", () => {
      const words = extractWords("version 2 token123");
      expect(words.has("version")).toBe(true);
      // "2" is only 1 char, so it's filtered out by {2,} regex
      expect(words.has("token123")).toBe(true);
    });

    it("ignores single-character latin words", () => {
      const words = extractWords("I have a question about AI");
      expect(words.has("i")).toBe(false);
      expect(words.has("a")).toBe(false);
      expect(words.has("have")).toBe(true);
      expect(words.has("question")).toBe(true);
      expect(words.has("about")).toBe(true);
      expect(words.has("ai")).toBe(true);
    });
  });

  // ============================
  // CJK characters
  // ============================

  describe("CJK characters", () => {
    it("extracts individual CJK characters", () => {
      const words = extractWords("你好世界");
      expect(words.has("你")).toBe(true);
      expect(words.has("好")).toBe(true);
      expect(words.has("世")).toBe(true);
      expect(words.has("界")).toBe(true);
    });

    it("extracts CJK 2-grams", () => {
      const words = extractWords("你好世界");
      expect(words.has("你好")).toBe(true);
      expect(words.has("好世")).toBe(true);
      expect(words.has("世界")).toBe(true);
    });

    it("handles Chinese text", () => {
      const words = extractWords("机器学习很有趣");
      expect(words.has("机")).toBe(true);
      expect(words.has("器")).toBe(true);
      expect(words.has("习")).toBe(true);
      // 2-grams are generated, not 4-grams
      expect(words.has("机器")).toBe(true);
      expect(words.has("学习")).toBe(true);
    });

    it("handles Japanese kana", () => {
      const words = extractWords("こんにちは");
      expect(words.has("こ")).toBe(true);
      expect(words.has("ん")).toBe(true);
      expect(words.has("こん")).toBe(true);
    });

    it("handles Korean", () => {
      const words = extractWords("안녕하세요");
      expect(words.has("안")).toBe(true);
      expect(words.has("녕")).toBe(true);
      expect(words.has("안녕")).toBe(true);
    });
  });

  // ============================
  // Mixed language
  // ============================

  describe("mixed language", () => {
    it("extracts both latin and CJK words from mixed text", () => {
      const words = extractWords("I love 机器学习 and AI");
      expect(words.has("love")).toBe(true);
      expect(words.has("and")).toBe(true);
      expect(words.has("ai")).toBe(true);
      expect(words.has("机")).toBe(true);
      expect(words.has("器")).toBe(true);
      expect(words.has("学习")).toBe(true);
    });
  });

  // ============================
  // Edge cases
  // ============================

  describe("edge cases", () => {
    it("returns empty set for empty string", () => {
      const words = extractWords("");
      expect(words.size).toBe(0);
    });

    it("returns empty set for whitespace-only string", () => {
      const words = extractWords("   ");
      expect(words.size).toBe(0);
    });

    it("returns empty set for special chars only", () => {
      const words = extractWords("!@#$%^&*()");
      expect(words.size).toBe(0);
    });

    it("extracts words ignoring punctuation", () => {
      const words = extractWords("Hello, world! How are you?");
      expect(words.has("hello")).toBe(true);
      expect(words.has("world")).toBe(true);
      expect(words.has("how")).toBe(true);
      expect(words.has("are")).toBe(true);
      expect(words.has("you")).toBe(true);
    });

    it("deduplicates words automatically (Set)", () => {
      const words = extractWords("hello hello HELLO Hello");
      expect(words.has("hello")).toBe(true);
      // Set ensures uniqueness
      let count = 0;
      words.forEach((w) => {
        if (w === "hello") count++;
      });
      expect(count).toBe(1);
    });
  });
});
