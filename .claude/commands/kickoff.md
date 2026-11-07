---
description: Start a work session — sync with main, read the docs in order, show my lane and next task
---

Start a work session in this team repo. Follow CLAUDE.md throughout.

1. **Who am I working for?** Take `git config user.name` and match it to a lane in `MEMORY.md` and a
   row in `docs/CONTEXT.md` § 9. If there's no clear match, ask before going on.
2. **Sync.** `git fetch origin`. On `main` with a clean tree: `git pull --ff-only`. On a branch: say how
   many commits it is behind `origin/main` and offer to rebase; never rebase a dirty tree without a yes.
3. **Read** in CLAUDE.md's order: `MEMORY.md`, `docs/CONTEXT.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`,
   `docs/AI_RULES.md`, `docs/PLAN.md`, `docs/OPERATIONS.md`. Don't summarise them back.
4. **Catch up:** this person's latest file in `docs/sessions/`, any teammate session files from the last
   day that touch the same area, and `git log --oneline origin/main -15` for what merged since.
5. **Report in at most 12 lines:**
   - Team state: phase, whether `main` is demo-able, next deadline.
   - This person's lane: where they stopped, their branch.
   - Their next `PLAN.md` task, or the first unclaimed one in the current phase.
   - Anything from teammates that affects them: `[contract]` merges, blockers, overlapping work.
6. **Ask what they want to do.** Don't start coding before they answer.

$ARGUMENTS
