import { describe, expect, it } from "vitest";
import { readJsonBody, secretMatches } from "./webhook";

describe("secretMatches", () => {
  it("accepts the same secret only", () => {
    expect(secretMatches("abc", "abc")).toBe(true);
    expect(secretMatches("abd", "abc")).toBe(false);
    expect(secretMatches("abcd", "abc")).toBe(false);
    expect(secretMatches(null, "abc")).toBe(false);
  });
});

describe("readJsonBody", () => {
  const post = (body: string) => new Request("http://x.test/", { method: "POST", body });
  it("parses JSON", async () => {
    expect(await readJsonBody(post('{"a":1}'), 100)).toEqual({ ok: true, value: { a: 1 } });
  });
  it("rejects invalid JSON with 400", async () => {
    expect(await readJsonBody(post("{not json"), 100)).toEqual({ ok: false, status: 400 });
  });
  it("rejects a body over the limit with 413", async () => {
    expect(await readJsonBody(post("x".repeat(101)), 100)).toEqual({ ok: false, status: 413 });
  });
  it("counts bytes, not characters", async () => {
    expect(await readJsonBody(post(`"${"ø".repeat(60)}"`), 100)).toEqual({ ok: false, status: 413 });
  });
});
