/**
 * Tests for ManagedTimer — lifecycle-managed setTimeout wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ManagedTimer } from "./managed-timer.js";

describe("ManagedTimer", () => {
  let timer: ManagedTimer;

  beforeEach(() => {
    timer = new ManagedTimer("test-timer");
    vi.useFakeTimers();
  });

  afterEach(() => {
    timer.cancel();
    vi.useRealTimers();
  });

  // ============================
  // Construction
  // ============================

  describe("construction", () => {
    it("creates a timer with a name", () => {
      expect(timer.name).toBe("test-timer");
    });

    it("starts with no pending timer", () => {
      expect(timer.pending).toBe(false);
      expect(timer.scheduledTime).toBe(0);
    });
  });

  // ============================
  // schedule
  // ============================

  describe("schedule", () => {
    it("fires callback after delay", () => {
      const cb = vi.fn();
      timer.schedule(5000, cb);

      expect(timer.pending).toBe(true);
      expect(timer.scheduledTime).toBeGreaterThan(Date.now());

      vi.advanceTimersByTime(5000);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(timer.pending).toBe(false);
    });

    it("cancels previous timer when rescheduled", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      timer.schedule(10000, cb1);
      timer.schedule(5000, cb2);

      vi.advanceTimersByTime(5000);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb1).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10000);
      expect(cb1).not.toHaveBeenCalled();
    });

    it("does not fire after cancel", () => {
      const cb = vi.fn();
      timer.schedule(5000, cb);
      timer.cancel();

      vi.advanceTimersByTime(10000);
      expect(cb).not.toHaveBeenCalled();
      expect(timer.pending).toBe(false);
    });
  });

  // ============================
  // scheduleAt
  // ============================

  describe("scheduleAt", () => {
    it("fires at the specified epoch time", () => {
      const cb = vi.fn();
      const now = Date.now();
      const target = now + 3000;

      timer.scheduleAt(target, cb);
      expect(timer.pending).toBe(true);

      vi.advanceTimersByTime(3000);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("fires immediately if epoch is in the past", () => {
      const cb = vi.fn();
      const past = Date.now() - 1000;

      timer.scheduleAt(past, cb);
      // Should fire on next tick (delay = 0)
      vi.advanceTimersByTime(0);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // ============================
  // tryAdvanceTo
  // ============================

  describe("tryAdvanceTo", () => {
    it("sets timer when no timer is pending", () => {
      const cb = vi.fn();
      const result = timer.tryAdvanceTo(Date.now() + 5000, cb);
      expect(result).toBe(true);
      expect(timer.pending).toBe(true);
    });

    it("advances when new time is earlier", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const now = Date.now();

      timer.scheduleAt(now + 10000, cb1);
      const result = timer.tryAdvanceTo(now + 5000, cb2);

      expect(result).toBe(true);
      vi.advanceTimersByTime(5000);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb1).not.toHaveBeenCalled();
    });

    it("does NOT advance when new time is later", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const now = Date.now();

      timer.scheduleAt(now + 5000, cb1);
      const result = timer.tryAdvanceTo(now + 10000, cb2);

      expect(result).toBe(false);
      vi.advanceTimersByTime(5000);
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).not.toHaveBeenCalled();
    });

    it("does NOT advance when new time equals current", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const now = Date.now();
      const target = now + 5000;

      timer.scheduleAt(target, cb1);
      const result = timer.tryAdvanceTo(target, cb2);

      expect(result).toBe(false);
    });
  });

  // ============================
  // flush
  // ============================

  describe("flush", () => {
    it("immediately triggers the callback", () => {
      const cb = vi.fn();
      timer.schedule(10000, cb);
      timer.flush();

      expect(cb).toHaveBeenCalledTimes(1);
      expect(timer.pending).toBe(false);
    });

    it("is a no-op when no timer is pending", () => {
      expect(() => timer.flush()).not.toThrow();
    });

    it("fires even when isDestroyed returns true", () => {
      // flush() intentionally skips the isDestroyed guard
      const destroyed = new ManagedTimer("destroyed-timer", () => true);
      const cb = vi.fn();
      destroyed.schedule(10000, cb);
      destroyed.flush();
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // ============================
  // isDestroyed guard
  // ============================

  describe("isDestroyed guard", () => {
    it("skips callback on natural fire when destroyed", () => {
      const cb = vi.fn();
      const guarded = new ManagedTimer("guarded", () => true);
      guarded.schedule(5000, cb);

      vi.advanceTimersByTime(5000);
      expect(cb).not.toHaveBeenCalled();
      expect(guarded.pending).toBe(false);
    });

    it("allows callback when not destroyed", () => {
      const cb = vi.fn();
      const guarded = new ManagedTimer("guarded", () => false);
      guarded.schedule(5000, cb);

      vi.advanceTimersByTime(5000);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // ============================
  // cancel
  // ============================

  describe("cancel", () => {
    it("cancels pending timer without firing", () => {
      const cb = vi.fn();
      timer.schedule(5000, cb);
      timer.cancel();

      expect(timer.pending).toBe(false);
      expect(timer.scheduledTime).toBe(0);

      vi.advanceTimersByTime(10000);
      expect(cb).not.toHaveBeenCalled();
    });

    it("is safe to call multiple times", () => {
      expect(() => {
        timer.cancel();
        timer.cancel();
        timer.cancel();
      }).not.toThrow();
    });
  });

  // ============================
  // Integration scenarios
  // ============================

  describe("integration scenarios", () => {
    it("schedule → cancel → reschedule works correctly", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      timer.schedule(5000, cb1);
      timer.cancel();
      timer.schedule(3000, cb2);

      vi.advanceTimersByTime(3000);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb1).not.toHaveBeenCalled();
    });

    it("rapid tryAdvanceTo sequence works correctly", () => {
      const now = Date.now();
      // First set to 20s
      timer.tryAdvanceTo(now + 20000, vi.fn());
      // Try to advance to 30s — should not change
      timer.tryAdvanceTo(now + 30000, vi.fn());
      // Advance to 10s — should reschedule
      const cb = vi.fn();
      const result = timer.tryAdvanceTo(now + 10000, cb);

      expect(result).toBe(true);
      vi.advanceTimersByTime(10000);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
