# Fettero

**Natten, ærlig overlevert.** *(The night, handed over honestly.)* Fettero gives the manager who takes
over a hotel at 06:00 the night on one page: which rooms can be sold today and for how much, what is
still open and who owns it, and what the night robot did and refused to do. Nothing on it says "done"
unless it was confirmed. The robot is our AI agent, which played Wybe's live hotel simulation on its
own; on the night in the app it reported "done" 73 times and Wybe's server confirmed all 73.

Built in 48 hours at **Oslo Sprint 2026** by **Team Fettero** (Hamad, ShirazIQ), for the main prize,
Wybe Night Shift, Holio (pains 3, 6 and 9) and ElevenLabs. *Hotell Nattskift* is the demo hotel.

## See it in 60 seconds

1. Open **https://lobby-sandy.vercel.app** on a laptop (1280 px or wider). It serves `main`; the screens
   below are on `hamad/jury-loop` until the team merges it (or run it locally, below).
2. Log in as **`jury`**: the jury's own account (admin view). Its password is in our `/lever`
   submission, not in this repo, and the account is deleted after the event. (On the deployed URL it
   works once the team has set the new `LOBBY_USERS` there.)
3. Click three things:
   1. **Overlevering 06:00** (from Oversikt: *Se overleveringen* in the top bar): the night on one
      page, every open item with an owner and a deadline, *Godkjent av Wybe-serveren: 73 av 73*, and
      *Kvitter mottatt*.
   2. **Åpne Rom → *Robotens romsjekk mot bookingsystemet*:** the robot found two rooms empty that the
      booking system has as occupied, *2 rom kan selges i dag · ca. 2 900 kr*; *Merk som ledig for
      salg* is one tap.
   3. **Forespørsler → the robot's open request → *Ta saken*:** what the robot didn't finish, it hands
      over with the reason; a person takes it in one tap. Then **Natteskift → *Robotens vurderinger i
      natt*** (it refused seven times to let a stranger into a room) and **3D-kart → *Spill av*:** the
      robot's real night.

Also worth a look: **Robotens øyne** on a phone (camera boxes; tap a product and Claude names it
without a barcode), **Resepsjon** (allow the microphone, then *Ring resepsjonen*: the ElevenLabs AI
receptionist; please give a made-up name) and the **host view**: log in as **`vert`** to see `/vert`,
an Airbnb host's four flats in Oslo on the same engine. Bookings, guests, staff, stock and prices are
test data, and every list says so.

## The Night Shift agent

- **Where:** the final agent is on the `hamad/final` branch ([`agent/`](./agent/) in Python, tests in
  [`tests/agent/`](./tests/agent/); `agent/` on this branch is older until `hamad/final` is merged to
  `main`). It plays Wybe's simulated hotel robot through Wybe's API and is scored only by Wybe's server.
  It plans on exact simulation time, reports "done" only after the server's score rises, and refuses
  unsafe moves in code. The work is done by rule-based flows per request type, found by probing an
  undocumented API; Claude is only a guarded fallback (about USD 0.001 spent all weekend).
- **Score, as a distribution, not a best night:**

  | | |
  |---|---|
  | Best live practice night | **2,712** (seed 10), **#12 of 20** on Wybe's practice board when written (Sun 8 Nov); board top 3,448 |
  | The final build's live nights | seed 10 2,707 · seed 16 2,680 · seed 5 2,584 · seed 23 2,334 · seed 9 1,965 · seed 11 1,914: **mean 2,364, median 2,459** |
  | Seeds tuned on least (9 and 11) | 1,965 and 1,914, our honest preview of unseen nights |
  | All 63 complete live practice nights, every version | median 1,888, mean 1,929 |
  | The night in the app (`public/runs/demo.jsonl`) | seed 16, 2,680: 73 "done" reports, **73 confirmed** by the server, 8 false claims declined, one penalty (a slip on a wet floor) |
  | Wybe's final (Sun 12:00–13:00) | revealed at 13:05 |

- **How we evaluate:** a replay bed rebuilds **51 real nights** offline from their run logs and
  predicts a real night's score at **3.8 %** mean error; every change has to beat the old code there
  before it gets a live shift (`python -m agent replaybench --fidelity` on `hamad/final`).
- **What it learned about the undocumented API:** [`docs/research/wybe-api.md`](./docs/research/wybe-api.md).
- **Run it:** the commands are in [`CLAUDE.md`](./CLAUDE.md) § How to run / test
  (`.venv/bin/python -m agent run --seed 1` plays offline against a fake server by default).

## The name

The product traded as *Lobby* until Saturday. Lobby is also a funded Zurich hotel-AI company sold
through Apaleo, the channel we plan to use, so on this branch the product is **Fettero**: our team's
coined name. The team lead decides whether `main` follows. Code identifiers (`lobby:` storage keys,
`LOBBY_USERS`) keep the old name.

## Docs for the jury

| File | What's in it |
|---|---|
| [`docs/DEMO.md`](./docs/DEMO.md) | The pitch, the 2-minute script, the agent's numbers, the business slide, the jurors' questions with honest answers, the Sunday user test |
| [`docs/PRD.md`](./docs/PRD.md) | What we built, for whom, and what we cut (draft for team review) |
| [`docs/HOLIO.md`](./docs/HOLIO.md) | Holio pains 3, 6 and 9: which screen, what works, what doesn't yet |
| [`docs/PRIVACY.md`](./docs/PRIVACY.md) | Personal data, processors, retention, security controls with file paths |
| [`docs/checks/threat-model.md`](./docs/checks/threat-model.md) | Threat model for login and roles |
| [`DESIGN.md`](./DESIGN.md) | The design system and the module list |

## Run it locally

```bash
npm ci
cp .env.example .env.local                      # then fill it in (ask the team where the secrets live)
node scripts/lobby-hash.mjs --secret            # prints LOBBY_AUTH_SECRET=…
node scripts/lobby-hash.mjs --users <password> [<jury password>]  # LOBBY_USERS=… (the team's accounts, and the jury's)
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
| `docs/HOLIO.md` | Holio pains 3, 6 and 9: screens and honest status |
| `docs/sessions/` | One handoff note per work session |
| `docs/superpowers/` | Specs and plans from brainstorming sessions |
| `docs/research/` · `docs/checks/` | Research notes · reviews, audits, test reports |
