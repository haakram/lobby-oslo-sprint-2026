# Lobby

**The whole hotel at 06:00, with a robot that works the night.** Lobby is a night-operations app for
a hotel: the manager who hands over to the day shift sees, on one screen, which rooms can be sold,
which guest is still waiting, what broke overnight, the stock, the staff, the shortest cleaning round
across floors, and what the night robot did. The robot is our AI agent, which played Wybe's live
hotel simulation on its own; its run log draws the rooms, the routes and the 3D map.

Built in 48 hours at **Oslo Sprint 2026** by **Team Fettero** (Hamad, ShirazIQ), for the main prize,
Wybe Night Shift, Holio (pains 3, 6 and 9) and ElevenLabs.

## See it in 60 seconds

1. Open **https://lobby-sandy.vercel.app** on a laptop (1280 px or wider). The Lobby v2 look described
   here goes live when `hamad/lobby-v2` is merged and deployed; until then the URL shows the older
   look of the same app.
2. Log in as **`hamad`** / **`***REMOVED***`** (admin: sees every module).
3. Click three things:
   1. **Oversikt → *Lag renholdsrute*** (the orange button): the rooms to clean become the shortest
      round across three floors, by lift when the cleaner has a cart.
   2. **Forespørsler → *Roboten fikk det ikke til* → *Ta over*:** what the robot couldn't do, it says
      so in the guest's own words, and a person takes it over.
   3. **3D-kart → *Spill av fra 22:00*,** then **Natteskift:** the robot's real night, step by step.

Also worth a look: **Robotens øyne** on a phone (camera boxes; tap a product and Claude names it
without a barcode) and **Resepsjon** (allow the microphone, then *Ring resepsjonen*: the ElevenLabs AI
receptionist). Guests, staff and stock are test data, and every list says so.

## The Night Shift agent

- **Where:** [`agent/`](./agent/) (Python), tests in [`tests/agent/`](./tests/agent/). It plays Wybe's
  simulated hotel robot through Wybe's API and is scored only by Wybe's server. It plans on exact
  simulation time, never reports "done" until the server's score rises, and refuses unsafe moves in
  code.
- **Score:** best live practice night **2,695 points** (seed 10): 74 "done" reports, 74 credited by
  the server, one penalty all night (a slip on a wet floor). The night replayed in the app is seed 5,
  2,212 points (`public/runs/demo.jsonl`). The final (10 shifts, Sun 12:00–13:00) is revealed at 13:05.
- **What it learned about the undocumented API:** [`docs/research/wybe-api.md`](./docs/research/wybe-api.md).
- **Run it:** the commands are in [`CLAUDE.md`](./CLAUDE.md) § How to run / test
  (`.venv/bin/python -m agent run --seed 1` plays offline against a fake server by default).

## Docs for the jury

| File | What's in it |
|---|---|
| [`docs/DEMO.md`](./docs/DEMO.md) | The pitch, the 2-minute demo script, sourced numbers, backup plan, judge Q&A |
| [`docs/PRD.md`](./docs/PRD.md) | What we built, for whom, and what we cut (draft for team review) |
| [`docs/PRIVACY.md`](./docs/PRIVACY.md) | Personal data, processors, retention, security controls with file paths |
| [`docs/checks/threat-model.md`](./docs/checks/threat-model.md) | Threat model for login and roles |
| [`DESIGN.md`](./DESIGN.md) | The design system and the module list |

## Run it locally

```bash
npm ci
cp .env.example .env.local                      # then fill it in (ask the team where the secrets live)
node scripts/lobby-hash.mjs --secret            # prints LOBBY_AUTH_SECRET=…
node scripts/lobby-hash.mjs --users <password>  # prints LOBBY_USERS=… (the four accounts)
npm run dev                                     # http://localhost:3000
npm run build && npm start                      # the production build (the demo's offline backup)
npm test                                        # app tests (vitest)
.venv/bin/python -m pytest                      # agent tests (after ./scripts/setup.sh)
```

Login needs `LOBBY_AUTH_SECRET` and `LOBBY_USERS`; Robotens øyne needs `ANTHROPIC_API_KEY`; the voice
screens need `ELEVENLABS_API_KEY` and their agent ids. Every variable is listed in
[`.env.example`](./.env.example). Stack: Next.js 16, React 19, three.js, MediaPipe, the Claude API and
ElevenLabs for the app; Python 3.12 and httpx for the agent.

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
| `docs/PRIVACY.md` | Personal data, processors, retention, security controls |
| `docs/ARCHITECTURE.md` | Stack, folders, module owners, contracts |
| `docs/AI_RULES.md` | Hard rules for humans and AIs |
| `docs/PLAN.md` | Phased roadmap, tasks, owners |
| `docs/OPERATIONS.md` | Setup, the gate, env, CI, deploy, demo day, troubleshooting |
| `docs/DEMO.md` | Demo script, pitch, submission checklist |
| `docs/sessions/` | One handoff note per work session |
| `docs/superpowers/` | Specs and plans from brainstorming sessions |
| `docs/research/` · `docs/checks/` | Research notes · reviews, audits, test reports |
