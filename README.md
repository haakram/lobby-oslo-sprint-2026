# Oslo Sprint 26

**TBD** — one line on what this is, once the idea is locked.

Built at the **Oslo Sprint 26** hackathon · Team: TBD

## New teammate? Start here

```bash
claude update           # a current Claude Code is needed for the team's plugins
git clone <repo-url>
cd <repo>
./scripts/setup.sh      # git hooks, .env, the team's Claude Code plugins, dependencies
# fill in .env (ask the team where the secrets live)
```

You now have the same AI setup as everyone else: superpowers, frontend-design, chrome-devtools-mcp
and diagram-design plugins, the Scrapling skill, Playwright and Context7 (approve them when Claude
Code asks), and `/kickoff` / `/handoff`. Details in `docs/OPERATIONS.md` § 9.

Then open the folder in Claude Code and either:

- paste the **next-chat prompt** from the newest file in [`docs/sessions/`](./docs/sessions/) (its
  last section), to continue exactly where the last session stopped; or
- type **`/kickoff`**: it syncs with `main`, reads the docs in order and tells you the team state,
  your lane and your next task.

Every session ends with **`/handoff`**, which saves a session note, updates `MEMORY.md` and
`docs/PLAN.md`, merges the work into `main` when CI is green, and leaves the prompt for the next chat.
That's how everyone, and every AI, stays on the same page.

How to run the app: TBD, added when the stack is chosen (see `docs/OPERATIONS.md`).

## How we work

- `main` is protected and always demo-able. Work on `<your-name>/<topic>`, open a PR, merge when CI
  is green. Details in [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- Tasks and owners: [`docs/PLAN.md`](./docs/PLAN.md). Live status: [`MEMORY.md`](./MEMORY.md).
- Using an AI assistant? Claude Code starts at [`CLAUDE.md`](./CLAUDE.md); other tools at
  [`AGENTS.md`](./AGENTS.md).

## Docs map

| File | What's in it |
|---|---|
| `CLAUDE.md` | AI entry point: reading order, working agreement, team rules |
| `AGENTS.md` | Points Cursor, Codex, Copilot … at the same rules |
| `MEMORY.md` | Live status board, one lane per teammate |
| `CONTRIBUTING.md` | Git workflow: branches, PRs, shared docs, conflicts |
| `DESIGN.md` | Design tokens, type, colour, voice |
| `docs/CONTEXT.md` | The hackathon: challenge, judging, deadlines, team, verbatim brief |
| `docs/PRD.md` | What we build and what we don't |
| `docs/ARCHITECTURE.md` | Stack, folders, module owners, contracts |
| `docs/AI_RULES.md` | Hard rules for humans and AIs |
| `docs/PLAN.md` | Phased roadmap, tasks, owners |
| `docs/OPERATIONS.md` | Setup, the gate, env, CI, deploy, demo day, troubleshooting |
| `docs/DEMO.md` | Demo script, pitch, submission checklist |
| `docs/sessions/` | One handoff note per work session |
| `docs/superpowers/` | Specs and plans from brainstorming sessions |
| `docs/research/` · `docs/checks/` | Research notes · reviews, audits, test reports |
