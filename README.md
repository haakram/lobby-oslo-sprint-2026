# Fettero

**Natten, ærlig overlevert.** *(The night, handed over honestly.)* Fettero gives the manager who takes
over a hotel at 06:00 the night on one page: which rooms can be sold today and for how much, what is
still open and who owns it, and what the night robot did and refused to do. Nothing on it says "done"
unless it was confirmed. The robot is our AI agent, which played Wybe's live hotel simulation on its
own; on the night in the app it reported "done" 73 times and the referee in Wybe's simulation
credited all 73 (973 of 976 over the final builds' 14 live nights).

Built in 48 hours at **Oslo Sprint 2026** by **Team Fettero** (Hamad, ShirazIQ), for the main prize,
Wybe Night Shift, Holio (pains 3, 6 and 9) and ElevenLabs. *Hotell Nattskift* is the demo hotel.

## See it in 60 seconds

1. **Run it locally** (below) or ask us for the laptop. The screens below are on `hamad/jury-loop`,
   which is not deployed (team lead's rule: it is not merged to `main`). The public URL,
   **https://lobby-sandy.vercel.app**, serves `main`: the older build, still under the old name
   *Lobby*, with an older security header (no `connect-src`; checked with curl Sun 02:50).
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
- **Every live night of the last three builds, pinned to the commit** (Wybe practice shifts, Sun 8 Nov;
  Wybe's final ranks the mean of ten unseen nights with the worst dropped):

  | Build on `hamad/final` | Played | Score per seed | Mean |
  |---|---|---|---|
  | `d4e445c` | 00:23–00:39 | 10: 2,707 · 16: 2,564 · 23: 2,254 · 5: 2,492 · **9: 1,965 · 11: 1,914** | 2,316 (tuned seeds 2,504; seeds 9 and 11: 1,940) |
  | `cb72845` | 01:07–01:14 | 10: 2,707 · **16: 2,680** (the night in the app) · 23: 2,334 · 5: 2,584 | 2,576 |
  | `8eac151`: the agent code of the final build (`hamad/final` head 2056404 adds only a rehearse command) | 01:50–01:58 | **10: 2,760** · 16: 2,679 · 23: 2,240 · 5: 2,559 | 2,560 (not played on 9 or 11) |

- **What we expect in the final: about 2,000 (1,900–2,100), not 2,760.** Seeds 9 and 11 are the only
  nights a build played without being tuned on them: 1,940 there against 2,504 on its tuned seeds, 22 %
  lower. The final build averages 2,560 on tuned seeds; 2,560 × 1,940 / 2,504 ≈ 1,980.
- **"Done" is checked:** over those 14 nights the agent said "done" 976 times and the referee (Wybe's
  server) credited 973, **99.7 %**; the 3 it didn't credit were all on seed 23. It declined 88 requests
  as false or impossible; the referee credited 73 of those declines and gave 15 nothing.
- **Board:** best practice score **2,798**, **#9 of 20** on Wybe's practice board at 02:47 Sun (top 3,448;
  we played 188 practice shifts, the leader 1,556). That night came from a test branch (`cdc67f1`,
  lookahead planner) that stranded on seed 23 in the same batch, so it is not in the final; the final
  build's best, 2,760, would sit at #10.
- **The night in the app** (`public/runs/demo.jsonl`, seed 16, 2,680, `cb72845`): 85 requests, 73
  "done", **all 73 credited**; 8 declined, of which the referee credited 7 (6 orders that never existed,
  1 already delivered) and not 1 (a spill report on floor 3); 4 still open at 06:00; one penalty (−15,
  it slipped on a wet floor at 23:51).
- **How we test a change before a live shift:** a replay bed (`agent/replaybed.py` on `hamad/final`)
  rebuilds every full live night offline from its log: 72 nights by 02:50 Sun. Replayed with the code
  that played them, 50 nights land within 61 points of live on average (**3.2 %**, 48 of 50 within
  10 %; [`docs/runs/replay-fidelity.txt`](./docs/runs/replay-fidelity.txt)). That number is
  **in-sample**: the bed's reward model was fitted on those same 50 nights. It shows the bed can
  reproduce a night, not that it ranks a change correctly. On the two pairs of builds that played the
  same seeds live, it got the direction right both times (+53 against live +72; −5 against live −17)
  and was about 35 points off per seed. The wet-floor change in `8eac151` is the worked example: across
  all 72 nights the bed gains +11.6 a night per seed (13 of 20 seeds better, 6 worse), which is why it
  stays on for the final; live, on the four seeds it played, it came out −17 a night (+53, −1, −94,
  −25). Four nights can't separate a change worth ±20 a night, and we don't claim they do. Details:
  `docs/DEMO.md` § 1.1.
- **Where the numbers come from:** [`docs/runs/ledger.csv`](./docs/runs/ledger.csv) (one row per live
  start) and [`docs/runs/builds.csv`](./docs/runs/builds.csv) (one row per commit), rebuilt from the run
  logs by `python3 scripts/ledger.py`.
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
