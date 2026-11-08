// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const describeScene = vi.hoisted(() => vi.fn());
vi.mock("@/features/eyes/scene", () => ({ describeScene }));
vi.mock("@/features/eyes/identify", () => {
  class BudgetExceeded extends Error {}
  return { BudgetExceeded };
});

import { BudgetExceeded } from "@/features/eyes/identify";
import { POST } from "./route";

const jpeg = (bytes = 10) => `data:image/jpeg;base64,${Buffer.alloc(bytes, 1).toString("base64")}`;
const call = (body: unknown) =>
  POST(new Request("http://localhost/api/scene", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  describeScene.mockReset();
});

describe("POST /api/scene", () => {
  it("rejects a non-image data URL with 400", async () => {
    const res = await call({ image: "data:text/plain;base64,AAAA" });
    expect(res.status).toBe(400);
    expect(describeScene).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(new Request("http://localhost/api/scene", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });

  it("rejects a 2 MB image with 400", async () => {
    const res = await call({ image: jpeg(2 * 1024 * 1024) });
    expect(res.status).toBe(400);
    expect(describeScene).not.toHaveBeenCalled();
  });

  it("answers 429 with the quota copy when the budget is spent", async () => {
    describeScene.mockImplementation(async () => {
      throw new BudgetExceeded();
    });
    const res = await call({ image: jpeg() });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("Dagens kvote for gjenkjenning er brukt opp.");
  });

  it("answers 502 without leaking the model error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    describeScene.mockImplementation(async () => {
      throw new Error("sk-ant-secret exploded");
    });
    const res = await call({ image: jpeg() });
    expect(res.status).toBe(502);
    expect(JSON.stringify(log.mock.calls)).not.toContain("sk-ant");
    log.mockRestore();
    expect(JSON.stringify(await res.json())).not.toContain("sk-ant");
  });

  it("returns the landmarks on success", async () => {
    const landmarks = [{ label: "Dør", x: 0.1, y: 0.1, w: 0.2, h: 0.6 }];
    const things = [{ name: "Caps", category: "other", kind: "guest", x: 0.4, y: 0.1, w: 0.2, h: 0.1 }];
    describeScene.mockResolvedValue({ landmarks, things });
    const res = await call({ image: jpeg() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ landmarks, things });
    expect(describeScene.mock.calls[0][1]).toBe("image/jpeg");
  });
});
