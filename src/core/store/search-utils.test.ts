/**
 * Tests for search-utils (rrfMerge).
 */

import { describe, it, expect } from "vitest";
import { rrfMerge, RRF_K } from "./search-utils.js";

interface TestItem {
  id: string;
  value: string;
}

describe("rrfMerge", () => {
  const getId = (item: TestItem) => item.id;

  // ============================
  // Basic merging
  // ============================

  describe("basic merging", () => {
    it("merges two ranked lists with RRF", () => {
      const list1: TestItem[] = [
        { id: "a", value: "first-a" },
        { id: "b", value: "first-b" },
      ];
      const list2: TestItem[] = [
        { id: "b", value: "second-b" },
        { id: "c", value: "second-c" },
      ];

      const merged = rrfMerge([list1, list2], getId);

      // Items in both lists get higher score
      expect(merged.length).toBe(3);
      // "b" appears in both lists → highest score
      expect(merged[0].id).toBe("b");
    });

    it("preserves top-ranked items from a single list", () => {
      const list: TestItem[] = [
        { id: "x", value: "top" },
        { id: "y", value: "middle" },
        { id: "z", value: "bottom" },
      ];

      const merged = rrfMerge([list], getId);
      expect(merged.length).toBe(3);
      expect(merged[0].id).toBe("x");
      expect(merged[1].id).toBe("y");
      expect(merged[2].id).toBe("z");
    });

    it("sorts by descending RRF score", () => {
      const list1: TestItem[] = [
        { id: "a", value: "" },
        { id: "b", value: "" },
      ];
      const list2: TestItem[] = [
        { id: "c", value: "" },
        { id: "d", value: "" },
      ];

      const merged = rrfMerge([list1, list2], getId);
      // All items appear once, sorted by rank within their list
      expect(merged[0].rrfScore).toBeGreaterThanOrEqual(merged[1].rrfScore);
    });
  });

  // ============================
  // Score calculation
  // ============================

  describe("score calculation", () => {
    it("awards higher score for top-ranked items", () => {
      const list: TestItem[] = [
        { id: "a", value: "" },
        { id: "b", value: "" },
        { id: "c", value: "" },
      ];

      const merged = rrfMerge([list], getId);
      expect(merged[0].rrfScore).toBeGreaterThan(merged[1].rrfScore);
      expect(merged[1].rrfScore).toBeGreaterThan(merged[2].rrfScore);
    });

    it("sums scores when item appears in multiple lists", () => {
      const list1: TestItem[] = [{ id: "shared", value: "" }];
      const list2: TestItem[] = [{ id: "shared", value: "" }];
      const list3: TestItem[] = [{ id: "lone", value: "" }];

      const merged = rrfMerge([list1, list2, list3], getId);
      // "shared" should have roughly 2x the score of "lone"
      const sharedScore = merged.find((m) => m.id === "shared")!.rrfScore;
      const loneScore = merged.find((m) => m.id === "lone")!.rrfScore;
      expect(sharedScore).toBeGreaterThan(loneScore);
    });
  });

  // ============================
  // Custom RRF constant
  // ============================

  describe("custom k parameter", () => {
    it("uses RRF_K=60 by default", () => {
      const list: TestItem[] = [{ id: "a", value: "" }];
      const merged = rrfMerge([list], getId);
      // Score for rank 0 with k=60: 1/(60+0+1) = 1/61 ≈ 0.01639
      expect(merged[0].rrfScore).toBeCloseTo(1 / 61, 4);
    });

    it("accepts custom k value", () => {
      const list: TestItem[] = [{ id: "a", value: "" }];
      const merged = rrfMerge([list], getId, 10);
      // Score for rank 0 with k=10: 1/(10+0+1) = 1/11 ≈ 0.0909
      expect(merged[0].rrfScore).toBeCloseTo(1 / 11, 4);
    });
  });

  // ============================
  // Edge cases
  // ============================

  describe("edge cases", () => {
    it("returns empty array for empty list input", () => {
      const merged = rrfMerge([], getId);
      expect(merged).toEqual([]);
    });

    it("returns empty array when all lists are empty", () => {
      const merged = rrfMerge([[], []], getId);
      expect(merged).toEqual([]);
    });

    it("handles single-item lists", () => {
      const list1: TestItem[] = [{ id: "only", value: "test" }];
      const merged = rrfMerge([list1], getId);
      expect(merged.length).toBe(1);
      expect(merged[0].id).toBe("only");
      expect(merged[0].value).toBe("test");
    });

    it("attaches rrfScore to all items", () => {
      const list: TestItem[] = [{ id: "a", value: "" }];
      const merged = rrfMerge([list], getId);
      expect(typeof merged[0].rrfScore).toBe("number");
      expect(merged[0].rrfScore).toBeGreaterThan(0);
    });

    it("handles items with duplicate IDs within the same list", () => {
      const list: TestItem[] = [
        { id: "dup", value: "first" },
        { id: "dup", value: "second" },
      ];
      // Second occurrence overwrites the first in the Map (same ID)
      const merged = rrfMerge([list], getId);
      // The duplicate ID gets the best rank score
      expect(merged.length).toBe(1);
      expect(merged[0].value).toBe("first"); // first rank (index 0) wins
    });

    it("handles items with different getId values but same content", () => {
      const list: TestItem[] = [
        { id: "unique-1", value: "same" },
        { id: "unique-2", value: "same" },
      ];
      const merged = rrfMerge([list], getId);
      expect(merged.length).toBe(2);
    });

    it("correctly merges three lists with overlap", () => {
      const list1: TestItem[] = [{ id: "a", value: "" }, { id: "b", value: "" }];
      const list2: TestItem[] = [{ id: "b", value: "" }, { id: "c", value: "" }];
      const list3: TestItem[] = [{ id: "c", value: "" }, { id: "a", value: "" }];

      const merged = rrfMerge([list1, list2, list3], getId);
      expect(merged.length).toBe(3);
      // "b" appears in 2 lists (rank 1 in list1, rank 0 in list2 = best position)
      // "a" appears in 2 lists (rank 0 in list1, rank 1 in list3)
      // "c" appears in 2 lists (rank 1 in list2, rank 0 in list3)
      // All appear in 2 lists, we check they all have rrfScore
      expect(merged.every((m) => m.rrfScore > 0)).toBe(true);
    });
  });
});
