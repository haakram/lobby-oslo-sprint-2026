# Contributing

How the team works in this repo without breaking each other's code.

1. **Pull** `main` before you start.
2. **Claim** a task in `docs/PLAN.md`.
3. **Branch:** `<your-name>/<topic>`.
4. **Commit small**, push often.
5. **PR** into `main`; merge when CI is green (and the owner of any area you touched has seen it).
6. **Hand off:** update your lane in `MEMORY.md`.

## Setup (once per machine)

```bash
./scripts/setup.sh
```

Without it the git hooks don't run on your machine. Install `gitleaks` too (`brew install gitleaks`)
so secrets are caught before they leave your laptop.

## Daily loop

```bash
git switch main && git pull                    # start fresh
git switch -c hamad/upload-form                # one branch per task
# … work, commit …
git fetch origin && git rebase origin/main     # stay current, at least every few hours
git push -u origin hamad/upload-form           # the pre-push hook runs check.sh --fast
gh pr create --fill                            # or open the PR on GitHub
```

After the merge: `git switch main && git pull && git branch -d hamad/upload-form`.

## Branches

- **`main`**: protected, always demo-able. Nobody commits or pushes to it directly.
- **`<name>/<topic>`**: your work, kebab-case topic. Short-lived: hours, not days.
- Rebasing your own branch is fine (`git push --force-with-lease`). Never force-push a branch
  someone else commits to.

## Commits

Imperative, saying what and why: `Add upload form validation`, `Fix crash on empty list`. One logical
change per commit.

## Pull requests

- **Small:** one task, ideally under ~400 changed lines. Big PRs conflict and nobody reviews them properly.
- Fill in the template: what, how you verified it, what it touches.
- CI (`check` and `secrets`) must be green. Read a red log before re-running anything.
- Touched an area someone else owns (`docs/ARCHITECTURE.md` § 3)? Get their 👍 before merging.
- Changed a schema, API shape, shared type or env var name? Put **`[contract]`** in the title and tell
  the team when it merges: their branches need a rebase.
- Merge with **Squash and merge**, so `main` stays one commit per task.

## Shared docs without conflicts

| File | Rule |
|---|---|
| `MEMORY.md` | Edit only your own lane. The "Team state" block: keep it tiny, pull right before editing. |
| `docs/PLAN.md` | Edit only tasks you own or are claiming. |
| `docs/sessions/` | Always a new file: `YYYY-MM-DD-<name>-<topic>.md`. |
| `CLAUDE.md`, `docs/AI_RULES.md` | Only through a PR the team agrees on: they steer everyone's AI. |
| `docs/PRD.md`, `docs/ARCHITECTURE.md`, `DESIGN.md` | The section's owner, or by team agreement. |

## Merge conflicts

1. `git fetch origin && git rebase origin/main`
2. For each conflict, keep both intents. In shared docs, keep both sides' lines.
3. Not sure what the other person meant? Ask them; don't delete their code.
4. Run `./scripts/check.sh` again before pushing.

## Secrets

Never commit them. `.env` is gitignored; `.env.example` gets the variable name with a blank value.
Leaked one? Tell the team and rotate it at the provider straight away. Deleting the commit isn't
enough once it's pushed.

## AI assistants

Claude Code reads `CLAUDE.md`; other tools read `AGENTS.md`, which points to the same rules. Start a
session with `/kickoff` and end it with `/handoff` so the next person, or your next session, knows
where you stopped. **You're responsible for what your AI commits:** read the diff before you push.

**We build with subagents** (team standard): design with `superpowers:brainstorming`, plan with
`superpowers:writing-plans`, build with `superpowers:subagent-driven-development`, and run
independent tasks in parallel. Use as many subagents as help.
