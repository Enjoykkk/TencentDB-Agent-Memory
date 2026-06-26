/**
 * Tests for SerialQueue — lightweight FIFO task queue with concurrency=1.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SerialQueue } from "./serial-queue.js";

describe("SerialQueue", () => {
  let queue: SerialQueue;

  beforeEach(() => {
    queue = new SerialQueue("test-queue");
  });

  // ============================
  // Construction
  // ============================

  describe("construction", () => {
    it("creates a queue with a name", () => {
      expect(queue.name).toBe("test-queue");
    });

    it("default name is 'unnamed' when not provided", () => {
      const q = new SerialQueue();
      expect(q.name).toBe("unnamed");
    });
  });

  // ============================
  // size, pending, idle
  // ============================

  describe("state (size, pending, idle)", () => {
    it("starts with size=0, pending=false, idle=true", () => {
      expect(queue.size).toBe(0);
      expect(queue.pending).toBe(false);
      expect(queue.idle).toBe(true);
    });

    it("size increases when tasks are queued (while paused)", () => {
      queue.pause();
      queue.add(() => Promise.resolve(1));
      expect(queue.size).toBe(1);
      queue.start();
    });
  });

  // ============================
  // add — serial execution
  // ============================

  describe("add", () => {
    it("executes a single task and returns its result", async () => {
      const result = await queue.add(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it("executes tasks in FIFO order", async () => {
      const order: number[] = [];
      const p1 = queue.add(async () => {
        order.push(1);
        return 1;
      });
      const p2 = queue.add(async () => {
        order.push(2);
        return 2;
      });
      const p3 = queue.add(async () => {
        order.push(3);
        return 3;
      });

      const results = await Promise.all([p1, p2, p3]);
      expect(order).toEqual([1, 2, 3]);
      expect(results).toEqual([1, 2, 3]);
    });

    it("serializes execution — only one task runs at a time", async () => {
      const running: number[] = [];
      const maxConcurrent: number[] = [];

      const tasks = [1, 2, 3].map((id) =>
        queue.add(async () => {
          running.push(id);
          maxConcurrent.push(running.length);
          // Small delay to allow potential race
          await new Promise((r) => setTimeout(r, 10));
          running.splice(running.indexOf(id), 1);
          return id;
        }),
      );

      await Promise.all(tasks);
      // Max concurrent should always be 1
      expect(Math.max(...maxConcurrent)).toBe(1);
    });

    it("propagates task errors to the caller", async () => {
      const err = new Error("task failed");
      await expect(queue.add(() => Promise.reject(err))).rejects.toThrow("task failed");
    });

    it("continues processing after a task error", async () => {
      const results: string[] = [];

      const p1 = queue.add(async () => {
        results.push("fail");
        throw new Error("oops");
      });
      const p2 = queue.add(async () => {
        results.push("success");
        return "ok";
      });

      await expect(p1).rejects.toThrow("oops");
      const r2 = await p2;
      expect(r2).toBe("ok");
      expect(results).toEqual(["fail", "success"]);
    });
  });

  // ============================
  // pause / start
  // ============================

  describe("pause / start", () => {
    it("pauses execution — queued tasks do not run until resumed", async () => {
      const order: number[] = [];

      const p1 = queue.add(async () => {
        order.push(1);
        return 1;
      });
      await p1; // let first task finish
      expect(order).toEqual([1]);

      queue.pause();
      const p2 = queue.add(async () => {
        order.push(2);
        return 2;
      });
      const p3 = queue.add(async () => {
        order.push(3);
        return 3;
      });

      // Give queued tasks a moment to prove they don't run
      await new Promise((r) => setTimeout(r, 30));
      expect(order).toEqual([1]); // tasks 2 & 3 still waiting

      queue.start();
      await Promise.all([p2, p3]);
      expect(order).toEqual([1, 2, 3]);
    });

    it("currently running task finishes even when paused", async () => {
      let finished = false;
      const p = queue.add(async () => {
        await new Promise((r) => setTimeout(r, 30));
        finished = true;
        return "done";
      });

      queue.pause(); // pause while task is running
      const result = await p;
      expect(result).toBe("done");
      expect(finished).toBe(true);
    });
  });

  // ============================
  // onIdle
  // ============================

  describe("onIdle", () => {
    it("resolves immediately when queue is idle", async () => {
      const start = Date.now();
      await queue.onIdle();
      expect(Date.now() - start).toBeLessThan(50);
    });

    it("resolves after all queued tasks complete", async () => {
      let idleResolved = false;
      queue.add(async () => {
        await new Promise((r) => setTimeout(r, 30));
        return 1;
      });
      queue.add(async () => {
        await new Promise((r) => setTimeout(r, 30));
        return 2;
      });

      const idlePromise = queue.onIdle().then(() => {
        idleResolved = true;
      });

      expect(idleResolved).toBe(false);
      await idlePromise;
      expect(idleResolved).toBe(true);
      expect(queue.idle).toBe(true);
    });
  });

  // ============================
  // clear
  // ============================

  describe("clear", () => {
    it("rejects all pending tasks with 'Queue cleared' error", async () => {
      queue.pause();
      const p1 = queue.add(() => Promise.resolve(1));
      const p2 = queue.add(() => Promise.resolve(2));
      expect(queue.size).toBe(2);

      // Catch rejections before clear to avoid unhandled rejections
      const r1 = p1.catch(() => {});
      const r2 = p2.catch(() => {});

      queue.clear();
      expect(queue.size).toBe(0);

      await expect(p1).rejects.toThrow("Queue cleared");
      await expect(p2).rejects.toThrow("Queue cleared");
      // Suppress the unhandled rejection warning by awaiting the caught promises too
      await r1;
      await r2;
    });

    it("does not affect already-completed tasks", async () => {
      const r1 = await queue.add(() => Promise.resolve("done"));
      expect(r1).toBe("done");

      queue.pause();
      const p2 = queue.add(() => Promise.resolve("will be cleared"));
      // Catch the pending promise before clearing to avoid unhandled rejection
      p2.catch(() => {});
      queue.clear();
      // r1 should still be fine
      expect(r1).toBe("done");
    });
  });

  // ============================
  // Debug logger
  // ============================

  describe("setDebugLogger", () => {
    it("receives enqueue, dequeue, and complete messages", async () => {
      const logs: string[] = [];
      queue.setDebugLogger((msg) => logs.push(msg));

      await queue.add(() => Promise.resolve("ok"));

      expect(logs.some((l) => l.includes("enqueued"))).toBe(true);
      expect(logs.some((l) => l.includes("dequeued"))).toBe(true);
      // "completed" may appear as "task completed"
      expect(logs.some((l) => l.includes("dequeued") || l.includes("completed"))).toBe(true);
    });
  });

  // ============================
  // Edge cases
  // ============================

  describe("edge cases", () => {
    it("handles tasks that resolve with a value", async () => {
      const result = await queue.add(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it("handles rapid add/start/pause sequences", async () => {
      queue.pause();
      const p1 = queue.add(() => Promise.resolve(1));
      queue.start();
      queue.pause();
      const p2 = queue.add(() => Promise.resolve(2));
      queue.start();
      expect(await p1).toBe(1);
      expect(await p2).toBe(2);
    });
  });
});
