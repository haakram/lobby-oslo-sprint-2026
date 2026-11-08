// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * .env.example is the env contract (docs/ARCHITECTURE.md § 4.4). Review round 2 found it naming a budget
 * variable the Next app never reads and missing the one it does; this keeps the two in step.
 */
const ROOT = join(__dirname, "..", "..");
/** Set by Node and Next themselves, never by us. */
const PLATFORM = new Set(["NODE_ENV"]);

function filesUnder(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name === "__pycache__" ? [] : filesUnder(path, pattern);
    return pattern.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * The file without its comments, so a variable only named in a comment doesn't count as read. Rough on
 * purpose: `//` after a colon (a URL) is kept, and `#` starts a comment only at a line start or after a space.
 */
function withoutComments(file: string): string {
  const text = readFileSync(file, "utf8");
  if (/\.(py|sh)$/.test(file)) return text.replace(/(^|\s)#.*$/gm, "$1");
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const documented = new Set(
  readFileSync(join(ROOT, ".env.example"), "utf8")
    .split("\n")
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name)),
);

describe(".env.example", () => {
  it("lists every variable the Next app reads", () => {
    const sources = [...filesUnder(join(ROOT, "src"), /\.tsx?$/), join(ROOT, "next.config.ts")];
    const read = new Set(
      sources.flatMap((file) => [...readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1])),
    );
    const missing = [...read].filter((name) => !PLATFORM.has(name) && !documented.has(name));
    expect(missing).toEqual([]);
    expect(read.has("APP_CLAUDE_BUDGET_USD")).toBe(true);
  });

  it("names no variable that nothing reads (the app, the agent, the viewer or the scripts), comments not counted", () => {
    const code = [
      ...filesUnder(join(ROOT, "src"), /\.tsx?$/),
      ...filesUnder(join(ROOT, "agent"), /\.py$/),
      ...filesUnder(join(ROOT, "scripts"), /\.(sh|mjs)$/),
      join(ROOT, "next.config.ts"),
    ]
      .map(withoutComments)
      .join("\n");
    const unread = [...documented].filter((name) => !new RegExp(`\\b${name}\\b`).test(code));
    expect(unread).toEqual([]);
  });
});
