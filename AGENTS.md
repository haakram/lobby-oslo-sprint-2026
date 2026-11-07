# AGENTS.md

Instructions for AI coding agents other than Claude Code (Cursor, Codex, Copilot, Windsurf, Gemini …).

This repo keeps **one** set of instructions for every AI tool, in **[`CLAUDE.md`](./CLAUDE.md)**. Read
it fully and follow it as if it were written for you: the reading order, the team rules, the working
agreement and the session ritual.

`/kickoff` and `/handoff` are Claude Code commands. If your tool has no equivalent, do the same steps
by hand; they're written out in [`.claude/commands/kickoff.md`](./.claude/commands/kickoff.md) and
[`.claude/commands/handoff.md`](./.claude/commands/handoff.md).

Don't add rules here. Put them in `CLAUDE.md` or `docs/AI_RULES.md` so every tool sees the same ones.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
