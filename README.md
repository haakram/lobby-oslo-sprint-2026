# Fettero

**Natten, ærlig overlevert.** *(The night, handed over honestly.)* Fettero gives the manager who takes
over a hotel at 06:00 the night on one page: what needs a person now and who owns it, which rooms can be
sold today and for how much, and what the night robot did and refused to do. Nothing on it says "done"
unless it was confirmed. For independent and chain hotels of 60–200 rooms, software first: hotel
number one needs no robot, because Fettero reads the booking system and the door-lock log. The robot in
the demo is our AI agent, which played Wybe's live hotel simulation on its own. On the night in the app
it said "done" 73 times: 64 after it had seen the simulator's score rise, and 9 on its own judgement (5
room checks, 4 spills), all 9 credited. Over the final branch's 18 live nights, 185 of its 189
own-judgement claims were credited (97.9 %).

Built in 48 hours at **Oslo Sprint 2026** by **Team Fettero** (Hamad, ShirazIQ), for the main prize,
Wybe Night Shift, Holio (pains 3, 6 and 9) and ElevenLabs. *Hotell Nattskift* is the demo hotel.

## See it in 60 seconds

1. **Run it locally** (below) or ask us for the laptop: the demo runs live from our laptop. The
   screens below are on `hamad/jury-loop`, which is not deployed (team lead's rule: it is not merged to
   `main`). A note on production, so nobody judges the wrong build: the only public deployment
   (`lobby-sandy.vercel.app`) serves `main`, the older build, still under the old name *Lobby*, with an
   older security header (no `connect-src`; checked with curl Sun 02:50).
2. Log in as **`jury`**: the jury's own account (admin view). Its password is in our `/lever`
   submission, not in this repo, and the account is deleted after the event.
3. Click **Se overleveringen 06:00** on Oversikt, then scroll the one page from top to bottom. It reads
   in the order the manager works: act, then evidence, then sign.
   1. **The top:** one factual line (*73 oppgaver bekreftet · 3 våte gulv og 1 ukjent person trenger en
      eier*) and four figures: *1 rom holdt tilbake fra salg* (209), *ca. 1 500 kr · Kan selges etter
      bekreftelse* (213), *4 saker · Sikkerhet, innen 06:30*, and the robot's *73 av 77*.
   2. ***Åpent nå*, safety first:** three wet floors without a sign and a stranger who asked the robot
      to open seven doors, each with an owner and *innen 06:30*. Then the room check: **209 is held
      back** (the robot carried bags for an arriving guest into a room the booking system still has
      booked until 9.11: *Fettero holdt rommet tilbake*), and **213 can be sold**: its guest was due out
      yesterday and the check-out was never recorded, so the system still holds the room tonight; the
      robot found it empty and tidy. *Bekreft med resepsjonen*, then *Merk som ledig for salg* (two
      steps, never one tap). Both rows say *Testdata: bookingen er lagt inn av teamet*: we wrote those
      bookings after the night to show the join, and in a pilot the evidence is the door-lock log and the
      energy slot, never a robot in a booked room.
   3. ***Robotens vurderinger i natt*:** it refused the stranger seven times; *9 av 9 «Ferdig» på
      robotens egen vurdering* (the other 64 came after the simulator confirmed the work); 7 of 8
      declines held; and its own faults, counted from its log (10 of 15 master-key entries without a
      knock, a wet floor it slipped on and never signed). The referee and the ledger sit behind *Slik vet
      vi det*.
   4. ***Kvitter mottatt*,** last.

   Then, if you like: **Forespørsler** (what the robot handed back is pinned first, with the reason)
   and **3D-kart → *Spill av*** (the robot's real night, replayed from its log).

The menu shows the pilot: **Overlevering, Rom og renhold, Forespørsler, Natteskift** (with Oversikt as
the start page). Everything else we built sits under the folded **Utenfor piloten**: **Robotens øyne**
on a phone (camera boxes; tap a product and Claude names it without a barcode; built for Holio),
**Resepsjon** (allow the microphone, then *Ring resepsjonen*: the ElevenLabs AI receptionist; the screen
says where the call goes; please give a made-up name), and more. The host view for short-let hosts
(`/vert`, its own login) was a test that the engine generalises; it is not part of the pilot.
Bookings, guests, staff, stock and prices are test data, and every list says so.

## The Night Shift agent

- **Where:** the final agent is on the `hamad/final` branch ([`agent/`](./agent/) in Python, tests in
  [`tests/agent/`](./tests/agent/); `agent/` on this branch is older until `hamad/final` is merged to
  `main`). It plays Wybe's simulated hotel robot through Wybe's API and is scored only by Wybe's server.
  It plans on exact simulation time, reports "done" for a delivery only after the server's score rises
  (room checks and spills are credited on the report itself, and it may try a "done" once to learn an
  unproven rule), and refuses unsafe moves in code. The work is done by rule-based flows per request type, found by probing an
  undocumented API; Claude is only a guarded fallback (about USD 0.001 spent all weekend).
- **Every live night of the last four builds, pinned to the commit** (Wybe practice shifts, Sun 8 Nov;
  Wybe's final ranks the mean of ten unseen nights with the worst dropped):

  | Build on `hamad/final` | Played | Score per seed | Mean |
  |---|---|---|---|
  | `d4e445c` | 00:23–00:39 | 10: 2,707 · 16: 2,564 · 23: 2,254 · 5: 2,492 · **9: 1,965 · 11: 1,914** | 2,316 (tuned seeds 2,504; seeds 9 and 11: 1,940) |
  | `cb72845` | 01:07–01:14 | 10: 2,707 · **16: 2,680** (the night in the app) · 23: 2,334 · 5: 2,584 | 2,576 |
  | `8eac151` | 01:50–01:58 | **10: 2,760** · 16: 2,679 · 23: 2,240 · 5: 2,559 | 2,560 |
  | `c3801e0`: the head of `hamad/final` at 03:30 (`8eac151`'s agent plus the end-of-night battery guard and a spill look) | 03:26 | **10: 2,760** · 16: 2,748 · 23: 2,298 · 5: 2,559 | 2,591 (not played on 9 or 11) |

- **What we expect in the final: a median of 2,035, 80 % between 1,898 and 2,186, not 2,760**
  ([`docs/runs/forecast.txt`](./docs/runs/forecast.txt), from `python3 scripts/forecast.py`, committed
  04:08 Sun, before the final). The model is log score = build + seed, fitted on every complete live
  build night (63 build×seed cells), then 20,000 simulated finals of the best 9 of 10 unseen seeds. Why
  lower than the 2,591 on tuned seeds: **mostly seed difficulty**. The four seeds the branch head
  played are easy ones, which alone is −19 %; the tuning penalty we can measure is about −6 %, from two
  nights (`d4e445c` on seeds 9 and 11), so it is rough. The replay bed screened changes on all 20 seeds,
  so the final is the only true holdout.
- **"Done" is checked, and we say what it rests on:** over those 18 nights the agent said "done" 1,267
  times and the referee (Wybe's server) credited 1,263, 99.7 %. But **1,078** of them were sent after
  the agent had already seen the score rise, so they are credited by construction. **On its own
  judgement it made 189 claims and 185 were credited (97.9 %): room checks 117 of 117, spill reports 68
  of 72**; the 4 misses are one probe on seed 23 repeated in every build. That is the figure that
  carries over to a hotel, which has no score. **And with the score hidden:** four live practice nights
  on a side branch (`hamad/blind`, Sun 04:26, seeds 10, 16, 23 and 5) where the agent never used the
  score or the referee's wording to decide "done", only what it saw (the place reply, the guest's
  answer, the sign over the spill): **290 of 291 credited, a false-done rate of 0.3 %**; the one miss is
  the same spill on seed 23, and the scores matched the sighted build on three seeds (+6 on the fourth). Over every live night with a log, every version, the
  app's judgement card recomputes the plain credited share from the ledger, so it moves as nights are
  logged. It declined 112 requests as false or impossible; the referee credited 93 of those declines
  and gave 19 nothing.
- **Board:** best practice score **2,807**, **#8 of 20** on Wybe's practice board at 04:10 Sun (top 3,448;
  we played 242 practice shifts, the leader 1,556). That night came from a board test (the `lottery`
  checkout, seed 10), a seed-specific test branch, so it is not in the final; the final branch's best,
  2,760 (`8eac151` and `c3801e0`), would sit at #11.
- **The night in the app** (`public/runs/demo.jsonl`, seed 16, 2,680, `cb72845`): 85 requests, 73
  "done", **all 73 credited**, 64 of them after the score rose and **9 on its own judgement (5 room
  checks, 4 spills), 9 of 9**; 8 declined, of which the referee credited 7 (6 orders that never existed,
  1 already delivered) and not 1 (a spill report on floor 3); 4 still open at 06:00; one penalty (−15,
  it slipped on a wet floor at 23:51).
- **How we test a change before a live shift:** a replay bed (`agent/replaybed.py` on `hamad/final`)
  rebuilds every full live night offline from its log (72 when we ran it at 02:55 Sun). Replayed with the code
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
  logs by `python3 scripts/ledger.py`, with the "done" split in its own columns (`done_after_rise`,
  `done_own`, `done_own_credited`). Board tests (53 seed-specific nights from test checkouts by 04:08,
  52 of them on seeds 10 and 16, best 2,807) are marked `kind=board-test` in the ledger and kept out of
  the build rows.
- **What it learned about the undocumented API:** [`docs/research/wybe-api.md`](./docs/research/wybe-api.md).
- **Run it:** the commands are in [`CLAUDE.md`](./CLAUDE.md) § How to run / test
  (`.venv/bin/python -m agent run --seed 1` plays offline against a fake server by default).

## The name

The product traded as *Lobby* until Saturday. Lobby is also a funded Zurich hotel-AI company sold
through Apaleo, the channel we plan to use, so on this branch the product is **Fettero**: our team's
coined name. The team lead decides whether `main` follows. Code identifiers (`lobby:` storage keys,
`LOBBY_USERS`) keep the old name. The name isn't cleared yet: the trademark searches (Patentstyret, EUIPO,
WIPO, and whether FERRERO's reputation reaches a sound-alike) are still to do (`docs/PRIVACY.md` § 9).

## Docs for the jury

| File | What's in it |
|---|---|
| [`docs/DEMO.md`](./docs/DEMO.md) | The pitch, the 2-minute script, the agent's numbers, the business slide, the jurors' questions with honest answers, the Sunday user test |
| [`docs/PRD.md`](./docs/PRD.md) | What we built, for whom, and what we cut (draft for team review) |
| [`docs/HOLIO.md`](./docs/HOLIO.md) | Holio pains 3, 6 and 9: which screen, what works, what doesn't yet |
| [`docs/PRIVACY.md`](./docs/PRIVACY.md) | Personal data, processors, retention, security controls with file paths |
| [`docs/checks/threat-model.md`](./docs/checks/threat-model.md) | Threat model for login and roles |
| [`docs/runlog.schema.json`](./docs/runlog.schema.json) | The vendor-neutral run log a robot sends (tasks with the evidence behind each "done", hazards, security events); an Open-RMF sample runs through it on Natteskift |
| [`docs/runs/forecast.txt`](./docs/runs/forecast.txt) | The forecast for the final, committed before it |
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
