# CLAUDE.md — Project entry point

> Every AI session in this repo starts here, for every teammate. **Read this file fully, then
> `MEMORY.md`, before touching code.** Start a session with `/kickoff` and end it with `/handoff`
> (§ Session ritual) so a closed chat never loses context.

## What this project is

**Team Fettero** (Hamad and ShirazIQ) at the Oslo Sprint hackathon, 6–8 Nov 2026. Two builds, one
story:

- **A. Night Shift agent:** the AI brain that plays Wybe's simulated hotel robot on its own, scored
  only by the Wybe server (tasks done, speed, no false "done", no unsafe moves). Must be finished
  **Sun 11:45**; the final runs 12:00–13:00.
- **B. Fettero app:** the robot's eyes (live camera with boxes, products recognised without a
  barcode), routes (shortest path across floors) and voice (ElevenLabs, translation). Pitched for the
  main prize, Holio pains 3, 6 and 9, and ElevenLabs.

**Build deadline: Sun 8 Nov 14:00.** The challenge, scoring, deadlines and the verbatim brief are in
`docs/CONTEXT.md`; the roadmap and owners are in `docs/PLAN.md`.

## Mandatory reading order

1. **`MEMORY.md`** — live team status: what each person is on right now, what's blocked.
2. **`docs/CONTEXT.md`** — the hackathon: challenge, judging criteria, deadlines, team, the verbatim brief.
3. **`docs/PRD.md`** — what we build and, just as important, what we **don't**.
4. **`docs/ARCHITECTURE.md`** — stack, folder layout, who owns which module, the contracts between modules.
5. **`docs/AI_RULES.md`** — hard rules. Constraints, not suggestions.
6. **`docs/PLAN.md`** — the phased roadmap: tasks, owners, what's next.
7. **`docs/OPERATIONS.md`** — runbooks: setup, the gate, env vars, CI, deploy, demo day.

Also: `DESIGN.md` before any UI work, `docs/DEMO.md` for the pitch and submission,
`CONTRIBUTING.md` for the git workflow.

If this file conflicts with a doc above, **the doc wins** (it's more detailed). If the docs conflict
with each other, **`AI_RULES.md` wins**.

## This is a team repo

Several people, each with their own AI assistant, work here at the same time. That changes how you work:

- **You work for one teammate, not for the team.** Find out who (`git config user.name`, their lane
  in `MEMORY.md`; ask if it isn't obvious) and stay inside the tasks they own in `PLAN.md`.
- **Never commit to `main`.** Work on a branch named `<name>/<topic>`, open a PR, merge only when CI
  is green. The git hooks and branch protection enforce this.
- **Stay in your lane.** Don't edit files in an area another teammate owns (`ARCHITECTURE.md` § 3)
  and don't reformat, rename or "tidy" files the task doesn't need. Unrelated diffs cause conflicts.
- **Contracts change loudly.** Data model, API shapes, shared types and env var names are listed in
  `ARCHITECTURE.md` § 4. Changing one means: the doc updated in the same PR, `[contract]` in the PR
  title, and the teammate told so they can tell the team.
- **Pull before you start, push small and often.** Small PRs merge cleanly; big ones rot.
- **Shared docs: edit only your part.** `MEMORY.md`: your own lane. `PLAN.md`: tasks you own or
  claim. `docs/sessions/`: a new file per session, never someone else's. `CLAUDE.md` and
  `docs/AI_RULES.md` change only through a PR the team agrees on, because they steer everyone's AI.

## Working agreement

- **Build with subagents (team standard, team lead 2026-11-07).** Every piece of work goes: design
  (`superpowers:brainstorming`) → plan (`superpowers:writing-plans`, saved in
  `docs/superpowers/plans/`) → build with **`superpowers:subagent-driven-development`**, independent
  tasks in parallel subagents (`superpowers:dispatching-parallel-agents`). Use as many subagents as
  help: the deadline is the constraint, not the count.
- **Claude API spend by our product is capped at USD 30** for the whole event (AI_RULES R7.7). Code
  that calls Claude tracks what it spends and stops before the cap.
- **One phase at a time** (`PLAN.md`). Inside a phase, people build different tasks in parallel.
- **Ask before scope changes.** Not in `PRD.md` → stop and ask; don't add it quietly.
- **The demo decides.** Weigh every choice against the 3-minute demo (`PRD.md` § 4). A feature the
  judges never see is worth less than polish on the one they do.
- **`main` is always demo-able.** If `main` breaks, fixing it beats everything else.
- **No secrets in git.** Keys go in `.env` (gitignored). New variable names go in `.env.example`
  with a blank value, in the same PR that first reads them.
- **Verified means seen.** Run `./scripts/check.sh`; for UI, look at it running (Playwright
  screenshots go in `temp/`, which is gitignored). Say what you verified.
- **Stubs are marked.** Anything faked for the demo gets `TODO(phase-N): …` so nothing fake ships
  unnoticed.

## Tech stack at a glance

**TBD at the rehearsal.** Full table in `ARCHITECTURE.md` § 1.

## How to run / test

```bash
./scripts/setup.sh          # once per machine: git hooks, .env, dependencies
./scripts/check.sh          # the gate: secrets, docs, lint, typecheck, tests, build
./scripts/check.sh --fast   # same without build; runs automatically before every push
```

Night Shift agent (offline against the fake server by default; `--live` is the real server and
every live start is counted in `temp/live_runs.jsonl`):

```bash
.venv/bin/python -m agent run --seed 1 [--sim-end 23:30:00] [--live]   # one practice shift
.venv/bin/python -m agent viewer [--port 8765]                         # 3D viewer of temp/runs/
.venv/bin/python -m agent route front-desk room-319 [--cart]           # shortest route
.venv/bin/python -m agent bench | tune                                 # offline benchmark / tuning (own task)
FINAL_ARMED=1 .venv/bin/python -m agent final                          # Sun 12:00 only, see OPERATIONS.md § 7
```

Stack-specific commands (dev server, tests, migrations, seed) are added here when the stack is chosen.

## Session ritual

- **Start: `/kickoff`** — syncs with `main`, reads the docs in order, shows your lane in `MEMORY.md`
  and your next `PLAN.md` task.
- **End: `/handoff`** — writes `docs/sessions/<date>-<name>-<topic>.md`, updates your lane in
  `MEMORY.md`, ticks `PLAN.md`, runs the gate, commits, pushes, merges into `main` when CI is green,
  and prints a **next-chat prompt**: paste it into a new chat (yours or a teammate's) to continue
  exactly where this one stopped. The prompt is also saved at the end of the session note.
- **New chat, no prompt at hand?** `/kickoff`, then read the newest file in `docs/sessions/`: its last
  section is the prompt the previous session left.

## When in doubt

- Scope → `PRD.md` § 6 "Out of scope".
- Structure, or who owns a file → `ARCHITECTURE.md` § 2–3.
- A hard rule → `AI_RULES.md`.
- What to build next → `PLAN.md`, your first unchecked task.
- How a screen looks → `DESIGN.md`. **Don't invent UI** outside it.
- A command or workflow → `OPERATIONS.md`, `CONTRIBUTING.md`.
- What the judges reward → `CONTEXT.md` § 3.
