// @vitest-environment node
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

// The public copy's default: nobody has configured accounts (no LOBBY_USERS), so the app is an open demo.
const BASE = "http://localhost:3104";

beforeAll(() => {
  vi.stubEnv("LOBBY_USERS", "");
  vi.stubEnv("LOBBY_AUTH_SECRET", "");
});

afterAll(() => vi.unstubAllEnvs());

const request = (path: string) => new NextRequest(`${BASE}${path}`);
const passes = (path: string) => proxy(request(path)).headers.get("x-middleware-next") === "1";

describe("proxy, open demo (no LOBBY_USERS)", () => {
  it("lets every page through without a login, the admin's screens and the host's app included", () => {
    for (const path of ["/", "/overlevering", "/hotell?etasje=2", "/oyne", "/resepsjon", "/lager", "/vert", "/runs/demo.jsonl"]) {
      expect(passes(path), path).toBe(true);
    }
  });

  it("lets the APIs through too (each one still says when its key is not set up)", () => {
    expect(passes("/api/scene")).toBe(true);
    expect(passes("/api/auth/session")).toBe(true);
  });

  it("sends /login to the home page", () => {
    const response = proxy(request("/login?next=%2Fhotell"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${BASE}/`);
  });
});
