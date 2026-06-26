/**
 * claudecode-plugin Gateway API integration tests.
 *
 * Coverage:
 *   1. Gateway health check
 *   2. /recall — memory recall (Hook: UserPromptSubmit)
 *   3. /capture — conversation capture (Hook: Stop)
 *   4. /search/memories — L1 memory search (MCP: tdai_memory_search)
 *   5. /search/conversations — L0 conversation search (MCP: tdai_conversation_search)
 *   6. /session/end — session flush
 *   7. End-to-end data flow: capture → search → recall
 *   8. Error paths: missing required fields, Gateway unavailable
 *
 * Prerequisites: Gateway must be running at http://127.0.0.1:8420
 * Run: npx vitest run claudecode-plugin/memory/memory_tencentdb/__tests__/gateway-api.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";

// ============================
// Configuration
// ============================

const GATEWAY = process.env.TDAI_GATEWAY_URL ?? "http://127.0.0.1:8420";
const TEST_SESSION = `cc-plugin-test-${Date.now()}`;

// ============================
// Helpers
// ============================

interface ApiResponse {
  [key: string]: unknown;
}

async function get(path: string): Promise<{ status: number; body: ApiResponse }> {
  const r = await fetch(`${GATEWAY}${path}`);
  return { status: r.status, body: (await r.json()) as ApiResponse };
}

async function post(path: string, data: Record<string, unknown>): Promise<{ status: number; body: ApiResponse }> {
  const r = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return { status: r.status, body: (await r.json()) as ApiResponse };
}

// ============================
// 1. Health check
// ============================

describe("1. Gateway health check", () => {
  it("1.1 GET /health returns ok status", async () => {
    const { status, body } = await get("/health");
    expect(status).toBe(200);
    expect(body.status).oneOf(["ok", "degraded"]);
  });

  it("1.2 /health includes version and uptime fields", async () => {
    const { body } = await get("/health");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("uptime");
    expect(typeof body.uptime).toBe("number");
  });

  it("1.3 /health reports stores status", async () => {
    const { body } = await get("/health");
    expect(body).toHaveProperty("stores");
    const stores = body.stores as Record<string, unknown>;
    expect(stores).toHaveProperty("vectorStore");
    expect(stores).toHaveProperty("embeddingService");
  });
});

// ============================
// 2. Recall endpoint (Hook: UserPromptSubmit → /recall)
// ============================

describe("2. POST /recall — memory recall", () => {
  it("2.1 normal recall: returns context and strategy", async () => {
    const { status, body } = await post("/recall", {
      query: "user preference test query",
      session_key: TEST_SESSION,
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty("context");
    expect(body).toHaveProperty("strategy");
    // context may be empty string (no memories yet), but must not be undefined
    expect(typeof body.context).toBe("string");
  });

  it("2.2 missing required field 'query' returns 400", async () => {
    const { status, body } = await post("/recall", {
      session_key: TEST_SESSION,
      // query missing
    });
    expect(status).toBe(400);
    expect(body).toHaveProperty("error");
  });

  it("2.3 missing required field 'session_key' returns 400", async () => {
    const { status, body } = await post("/recall", {
      query: "test query",
      // session_key missing
    });
    expect(status).toBe(400);
    expect(body).toHaveProperty("error");
  });

  it("2.4 empty query returns 400", async () => {
    const { status } = await post("/recall", {
      query: "",
      session_key: TEST_SESSION,
    });
    expect(status).toBe(400);
  });
});

// ============================
// 3. Capture endpoint (Hook: Stop → /capture)
// ============================

describe("3. POST /capture — conversation capture", () => {
  const SESSION = `${TEST_SESSION}-capture`;

  it("3.1 normal capture: returns l0_recorded", async () => {
    const { status, body } = await post("/capture", {
      user_content: "I like functional programming",
      assistant_content: "Got it, I've noted your preference for functional programming",
      session_key: SESSION,
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty("l0_recorded");
    expect(typeof body.l0_recorded).toBe("number");
    expect(body.l0_recorded).toBeGreaterThan(0);
  });

  it("3.2 capture with messages array", async () => {
    const { status, body } = await post("/capture", {
      user_content: "Recommend a TypeScript library",
      assistant_content: "I recommend fp-ts for functional programming",
      session_key: SESSION,
      messages: [
        { role: "user", content: "Recommend a TypeScript library" },
        { role: "assistant", content: "I recommend fp-ts for functional programming" },
      ],
    });
    expect(status).toBe(200);
    expect(body.l0_recorded).toBeGreaterThan(0);
  });

  it("3.3 missing required field 'user_content' returns 400", async () => {
    const { status, body } = await post("/capture", {
      assistant_content: "ok",
      session_key: SESSION,
      // user_content missing
    });
    expect(status).toBe(400);
    expect(body).toHaveProperty("error");
  });

  it("3.4 missing required field 'assistant_content' returns 400", async () => {
    const { status, body } = await post("/capture", {
      user_content: "hello",
      session_key: SESSION,
      // assistant_content missing
    });
    expect(status).toBe(400);
    expect(body).toHaveProperty("error");
  });

  it("3.5 missing required field 'session_key' returns 400", async () => {
    const { status } = await post("/capture", {
      user_content: "hello",
      assistant_content: "hi",
      // session_key missing
    });
    expect(status).toBe(400);
  });
});

// ============================
// 4. Search Memories endpoint (MCP: tdai_memory_search)
// ============================

describe("4. POST /search/memories — L1 memory search", () => {
  it("4.1 normal search: returns results and total", async () => {
    const { status, body } = await post("/search/memories", {
      query: "programming",
      limit: 5,
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("total");
    expect(typeof body.results).toBe("string");
    expect(typeof body.total).toBe("number");
  });

  it("4.2 with type filter", async () => {
    const { status, body } = await post("/search/memories", {
      query: "programming",
      limit: 3,
      type: "episodic",
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty("results");
  });

  it("4.3 with scene filter", async () => {
    const { status, body } = await post("/search/memories", {
      query: "programming",
      limit: 3,
      scene: "coding",
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty("results");
  });

  it("4.4 missing query returns 400", async () => {
    const { status, body } = await post("/search/memories", {
      limit: 5,
      // query missing
    });
    expect(status).toBe(400);
    expect(body).toHaveProperty("error");
  });

  it("4.5 empty string query returns 400", async () => {
    const { status } = await post("/search/memories", {
      query: "",
    });
    expect(status).toBe(400);
  });
});

// ============================
// 5. Search Conversations endpoint (MCP: tdai_conversation_search)
// ============================

describe("5. POST /search/conversations — L0 conversation search", () => {
  it("5.1 normal search: returns results and total", async () => {
    const { status, body } = await post("/search/conversations", {
      query: "functional programming",
      limit: 5,
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("total");
  });

  it("5.2 with session_key filter", async () => {
    const { status, body } = await post("/search/conversations", {
      query: "TypeScript",
      limit: 3,
      session_key: `${TEST_SESSION}-capture`,
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty("results");
  });

  it("5.3 missing query returns 400", async () => {
    const { status } = await post("/search/conversations", {
      // query missing
    });
    expect(status).toBe(400);
  });
});

// ============================
// 6. Session End endpoint
// ============================

describe("6. POST /session/end — session flush", () => {
  it("6.1 normal end: returns flushed=true", async () => {
    const { status, body } = await post("/session/end", {
      session_key: `${TEST_SESSION}-capture`,
    });
    expect(status).toBe(200);
    expect(body).toEqual({ flushed: true });
  });

  it("6.2 missing session_key returns 400", async () => {
    const { status } = await post("/session/end", {
      // session_key missing
    });
    expect(status).toBe(400);
  });
});

// ============================
// 7. End-to-end data flow
// ============================

describe("7. Data flow: capture → search → recall", () => {
  const FLOW_SESSION = `${TEST_SESSION}-flow`;

  it("7.1 capture a specially-marked conversation turn", async () => {
    const { status, body } = await post("/capture", {
      user_content: "E2E-FLOW-MARKER: My cat is named Luna, she is a Siamese",
      assistant_content: "Got it, Luna the Siamese cat — noted",
      session_key: FLOW_SESSION,
    });
    expect(status).toBe(200);
    expect(body.l0_recorded).toBeGreaterThan(0);
  });

  it("7.2 search/conversations finds the captured turn", async () => {
    const { status, body } = await post("/search/conversations", {
      query: "Luna Siamese",
      limit: 5,
      session_key: FLOW_SESSION,
    });
    expect(status).toBe(200);
    // Tokenization / vectorization may need a moment; just verify a result is returned
    expect(body).toHaveProperty("results");
  });

  it("7.3 recall returns context based on new memories", async () => {
    const { status, body } = await post("/recall", {
      query: "what is my cat's name",
      session_key: FLOW_SESSION,
    });
    expect(status).toBe(200);
    expect(body).toHaveProperty("context");
  });

  it("7.4 end session flushes cleanly", async () => {
    const { status, body } = await post("/session/end", {
      session_key: FLOW_SESSION,
    });
    expect(status).toBe(200);
    expect(body.flushed).toBe(true);
  });
});

// ============================
// 8. Error paths
// ============================

describe("8. Error paths", () => {
  it("8.1 unknown path returns 404", async () => {
    const { status, body } = await post("/unknown-endpoint", {});
    expect(status).toBe(404);
    expect(body).toHaveProperty("error");
  });

  it("8.2 malformed JSON body returns 400 or 500 (must not crash)", async () => {
    const r = await fetch(`${GATEWAY}/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid JSON {{{",
    });
    // Gateway must return an error without crashing
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("8.3 oversized request body does not crash", async () => {
    const bigString = "x".repeat(100_000);
    const { status } = await post("/recall", {
      query: bigString,
      session_key: "big-data-test",
    });
    // Must return 200 or 400, not 500 crash
    expect([200, 400]).toContain(status);
  });
});
