import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

const SECRET = "x".repeat(32);

function call(tool: string, body: string, headers: Record<string, string> = { "x-reception-secret": SECRET }) {
  const request = new Request(`http://x.test/api/reception/tools/${tool}`, { method: "POST", body, headers });
  return POST(request, { params: Promise.resolve({ tool }) });
}

describe("POST /api/reception/tools/[tool]", () => {
  beforeEach(() => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-eleven-key-value-0000");
    vi.stubEnv("RECEPTION_TOOL_SECRET", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const valid = JSON.stringify({ arrival: "2026-12-01", departure: "2026-12-03", guests: 2 });

  it("503 when no secret is configured", async () => {
    vi.stubEnv("RECEPTION_TOOL_SECRET", undefined);
    expect((await call("check_availability", valid)).status).toBe(503);
  });

  it("401 for a missing or wrong secret", async () => {
    expect((await call("check_availability", valid, {})).status).toBe(401);
    expect((await call("check_availability", valid, { "x-reception-secret": "nope" })).status).toBe(401);
  });

  it("404 for an unknown tool", async () => {
    expect((await call("delete_everything", valid)).status).toBe(404);
  });

  it("400 for invalid JSON", async () => {
    expect((await call("check_availability", "{not json")).status).toBe(400);
  });

  it("413 for a big body", async () => {
    expect((await call("check_availability", "x".repeat(9000))).status).toBe(413);
  });

  it("200 with a result string for a valid call", async () => {
    const response = await call("check_availability", valid);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: expect.any(String) });
  });

  it("does not log arguments", async () => {
    await call("record_message", JSON.stringify({ name: "Kari Hemmelig", phone: "+4722334455", topic: "other", message: "hei" }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Hemmelig");
  });
});
