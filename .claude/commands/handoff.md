---
description: End a work session — session note, MEMORY.md lane, PLAN.md, then commit, push, merge to main when CI is green, and print the prompt for the next chat
---

Close this work session so nothing is lost when the chat ends, and so a teammate who pulls `main`
has exactly what you have. Follow CLAUDE.md throughout.

1. **Where things stand:** `git status`, the current branch, uncommitted work. On `main` with
   changes? Move them to a branch first: `git switch -c <name>/<topic>`.
2. **Session note:** create `docs/sessions/YYYY-MM-DD-HHMM-<name>-<topic>.md` from
   `docs/sessions/_TEMPLATE.md`: done, decisions and why, what didn't work, next, and the
   **next-chat prompt** (step 8). Facts only, with file paths and PR numbers.
3. **MEMORY.md:** update **only this person's lane** (working on, branch, done, next, blocked,
   updated, and the path of this session note). Touch the Team state block only if the phase,
   `main`'s health or a team-wide blocker changed.
4. **PLAN.md:** tick the tasks this session finished, with one line on what was verified. Parked
   questions and on-the-fly decisions go in § Team review list.
5. **Other docs:** a decision that changed scope, a contract or the design must also be in
   `PRD.md`, `ARCHITECTURE.md` or `DESIGN.md`. A contract change means the PR title gets `[contract]`.
6. **Gate and commit:** run `./scripts/check.sh`. If it fails, fix it or stop here and say so: a red
   gate is never merged. Then commit all of the session's work (code and docs) on the branch:
   `Handoff: <topic>` (or one commit per logical change if that's clearer).
7. **Push and merge** (skip and say so if the repo has no GitHub remote yet):
   - `git push -u origin <branch>` (the pre-push hook runs the fast gate).
   - Open the PR if there isn't one: `gh pr create --fill`, filling in the template's "What",
     "How I verified it" and "Touches" from the session.
   - Wait for CI: `gh pr checks --watch`.
   - **Green →** `gh pr merge --squash --delete-branch`, then `git switch main && git pull`.
   - **Red →** don't merge. Read the log (`gh run view --log-failed`), say what failed, and put the
     fix first in the next-chat prompt.
   - A merge conflict → rebase on `origin/main`, keep both sides' intent (CONTRIBUTING.md), run the
     gate again, push. Never force-push `main`.
8. **Next-chat prompt:** print it last, in one fenced block the person can paste straight into a new
   chat (theirs or a teammate's). Same text as in the session note. Shape:

   ```
   Continue the Oslo Sprint 26 project in this repo. First run /kickoff, then read
   docs/sessions/<this note>.md (the last handoff).
   Where we stopped: <one or two lines>
   State of main: <green / what's broken>
   Next task: PLAN Phase <n>, "<task>" [owner: <name>], branch <name>/<topic>
   Watch out for: <open questions, contract changes, deadlines: Wybe practice closes Sun 11:45,
   build deadline Sun 14:00>
   ```

Finish with a two-line summary: what merged (PR number) and where the next chat picks up.

$ARGUMENTS
