# AI_RULES.md — Non-negotiable rules

These are **hard constraints**, not preferences, for every teammate and every AI. If a rule conflicts
with a good idea, the rule wins. If you (the AI) think a rule is wrong, **stop and ask your teammate**;
don't quietly break it. Rules change only through a PR the team agrees on.

---

## R1. Stack discipline

- **R1.1** Use the stack in `ARCHITECTURE.md` § 1. No second framework, ORM, UI library or language
  "just for this part".
- **R1.2** One package manager per language. The lockfile is committed and never edited by hand.
- **R1.3** TBD at the rehearsal: stack-specific rules (e.g. TypeScript `strict`, no `any`; one styling
  approach; server components by default).

## R2. Scope

- **R2.1** Build what `PRD.md` lists. Not there → stop and ask.
- **R2.2** Musts before shoulds, shoulds before coulds. No polish on a could while a must is broken.
- **R2.3** After feature freeze (`CONTEXT.md` § 4): only fixes and demo polish.

## R3. Security

- **R3.1** No secrets in git: not in code, docs, tests, fixtures or commit messages. `.env` is
  gitignored; `.env.example` holds names with blank values. A leaked key is **rotated** at the
  provider, not just deleted: it lives on in git history.
- **R3.2** Secrets are read server-side only. Never in client code or a public env prefix.
- **R3.3** Validate every external input: request bodies, params, uploads, and LLM output used as data.
- **R3.4** No real personal data. Demo and seed data are made up.
- **R3.5** No `eval`, `new Function` or `exec` on strings from users or models.

## R4. Code structure

- **R4.1** Follow the layout in `ARCHITECTURE.md` § 2. A new top-level folder needs the team's OK.
- **R4.2** Each contract (`ARCHITECTURE.md` § 4) lives in one place. Never duplicate a type or schema.
- **R4.3** Small files, one job each. A route handler past ~50 lines moves its logic into a module.
- **R4.4** No commented-out code (git has history). No debug `console.log` / `print` left in commits.

## R5. Quality gates

- **R5.1** `./scripts/check.sh` passes before a PR is opened (the pre-push hook runs the fast
  version). CI runs it again; a red PR doesn't merge.
- **R5.2** Never skip hooks (`--no-verify`, `ALLOW_MAIN=1`) or disable a test to get green. Fix the
  cause, or ask.
- **R5.3** Once it exists, the demo path (`PRD.md` § 4) has an automated test or a written manual
  check in `PLAN.md`.
- **R5.4** "Done" means verified: tests ran and, for UI, you looked at it running. Say what you checked.

## R6. Plan adherence

- **R6.1** `PLAN.md` is the single source of truth for what's being built now.
- **R6.2** Tick tasks in the same PR that completes them.
- **R6.3** If the plan is wrong: **stop, propose an amendment, wait.** Don't rewrite it silently.
- **R6.4** Implementation runs from a written plan in `docs/superpowers/plans/` through
  `superpowers:subagent-driven-development` (team standard, 2026-11-07). Independent tasks run in
  parallel subagents; each subagent's work passes the skill's reviews before it's merged. Claude Code
  subagents may be used freely.

## R7. Team safety

- **R7.1** Never commit or push to `main`. Branch `<name>/<topic>` → PR → green CI → merge.
- **R7.2** Never force-push `main` or a branch someone else works on. `--force-with-lease` on your own
  branch only.
- **R7.3** Never revert, overwrite or delete a teammate's work to make yours fit. In a conflict, keep
  both intents, or ask.
- **R7.4** Touch only the files your task needs. No drive-by reformatting, renaming or cleanup.
- **R7.5** A contract change (`ARCHITECTURE.md` § 4) needs `[contract]` in the PR title, the doc
  updated in the same PR, and the team told.
- **R7.6** A new dependency is explained in the PR description. Shared tool config (formatter, linter,
  CI) changes only by team agreement.
- **R7.7** Nothing metered is spent without stating the cost first: paid API calls, credits, CI minutes
  on a private repo. **The product's Claude API spend is capped at USD 30 in total** (team lead,
  2026-11-07; `ANTHROPIC_BUDGET_USD`): every code path that calls Claude counts its tokens and stops
  before the cap. Claude Code subagents run on each person's own Claude plan and are not part of it.
- **R7.8** Shared docs: your own `MEMORY.md` lane, your own `PLAN.md` tasks, new session files only.

## R8. Explicitly OK

(Listed because AIs over-engineer.)

- ✅ Hardcoded seed data, a fake login, mocked third-party calls, when the demo story doesn't need the
  real thing. Mark them `TODO(phase-N)`.
- ✅ Copying a small snippet instead of adding a dependency.
- ✅ No abstraction until the second use.
- ✅ Tests only for the demo path and the tricky logic.

## R9. The "stop and ask" list

Stop and ask your teammate before:

- Adding a top-level dependency or an external service not in `ARCHITECTURE.md`.
- Changing a contract (schema, API shape, shared type, env var name).
- Editing a file in an area someone else owns (`ARCHITECTURE.md` § 3).
- Choosing between two reasonable approaches the docs don't settle.
- Anything destructive: deleting branches, data or deployments; force-pushing; rotating shared keys.
- Spending money or credits.
- Breaking any rule above "just this once".

When asking, use this format:

> **Decision needed (Phase X, file Y):** one-sentence question
> Option A: trade-off
> Option B: trade-off
> My recommendation: A, because …

Don't proceed until they pick.
