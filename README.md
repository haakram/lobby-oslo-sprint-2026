# Fettero

**Natten, ærlig overlevert.** *(The night, handed over honestly.)* Fettero gives the manager who takes
over a hotel at 06:00 the night on one page: what needs a person now and who owns it, which rooms can be
sold today, and what the night robot did and refused to do. Nothing on it says "done" unless it was
confirmed. ***Fettero finner rommene der bookingsystemet og dørlåsen er uenige — før renholdet gjør
det.*** (It finds the rooms your booking system and your door locks disagree about, before
housekeeping does.) For independent and chain hotels of 60–200 rooms, software first: hotel number one
needs no robot, because Fettero reads the booking system (read-only), one signal per room from the door
lock (never who, never when) and the night clerk's own entries.

The robot in the demo is our AI agent, which played Wybe's live hotel simulation on its own, and we hold
it to the same rule. On the night in the app it said "done" 73 times: 64 after it had seen the
simulator's score rise, and 9 on its own judgement (5 room checks, 4 spills). The simulator credited all
9, but the robot's own log contradicts one (it reported 209 empty at 03:47 after carrying bags in at
01:29), so the card says **8 of 9 hold against its own log**. The same rule over every night: on the
final branch the simulator credited 64 of 65 distinct own-judgement claims, but **54 of 65 hold against
the robot's own log** (95 % interval 72–90 %), because the simulator's room check doesn't see what the
robot itself delivered.

**For** 60–200-room hotels, the manager who takes over at 06:00 · **Price** NOK 30 per room per month ·
**First channel** direct, from the Sunday phone round (`docs/DEMO.md` § 8.1, not run yet) · **Ask** a
free four-week pilot, software only, read-only on the booking system, with a one-page data processing
agreement ([`docs/DPA.md`](./docs/DPA.md)).

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
3. You land on **Overlevering 06:00**. Every move is a tap; it reads in the order the manager works:
   act, then evidence, then sign.
   1. **The top:** four figures, each a link to its row: *1 rom · Holdt tilbake fra salg* (209: the
      robot reported it empty at 03:47, but its own log says it carried bags in at 01:29), *ca. 1 500 kr
      · Funnet ledig 5 timer tidligere* (213, *hvis natten blir utsolgt · 31 av 36 booket i kveld*,
      with *Slik regner vi*), *4 saker · Sikkerhet, straks*, and the robot's *73 av 77*. One quiet band
      says what is test data.
   2. **The switch *Natten fra: Med robot | Uten robot*.** *Uten robot* builds the same page from the
      booking system, one signal per room from the door lock (never who) and the night clerk's own
      entries (*Nattevaktens logg*, `/natt`), with no robot line: the product hotel number one buys.
   3. **213, the money step:** due out yesterday, the check-out never recorded; without the robot the
      lock shows no guest card since 18:00 and the night clerk saw it empty at 04:24 (*Bekreftet av to
      kilder*). Reception confirms who checked and three facts (folio, bags, key card), then *Send til
      resepsjonen*; the row reads *Venter på PMS-en*, because the pilot never writes to the booking
      system. Nothing says "sold".
   4. ***Åpent nå*, safety first:** three wet floors without a sign and a stranger who asked the robot
      to open seven doors, *straks*, with who was told; the robot itself at 06:00, not docked and still
      holding the master keycard; then everything by deadline, each with an owner.
   5. ***Robotens vurderinger i natt*:** three figures, *8 av 9* "done" on its own judgement hold
      against its own log, *7* refusals of the stranger, *10 av 15* keycard entries without a knock;
      beside the night clerk's note, *«Rolig natt.»* The referee, the ledger, the score-blind run and
      the fault test sit behind *Slik vet vi det*.
   6. ***Kvitter mottatt*,** last.

   Then, if you like: **Forespørsler** (what the robot handed back is pinned first, with the reason)
   and **3D-kart → *Spill av*** (the robot's real night, replayed from its log).

The menu shows the pilot: **Overlevering, Nattevaktens logg, Rom og renhold, Forespørsler, Natteskift**
(Oversikt one tap away). Everything else we built sits under the folded **Utenfor piloten**: **Robotens øyne**
on a phone (camera boxes; tap a product and Claude names it without a barcode; built for Holio),
**Resepsjon** (allow the microphone, then *Ring resepsjonen*: the ElevenLabs AI receptionist; the screen
says where the call goes; please give a made-up name), and more. The host view for short-let hosts
(`/vert`, its own login) was a test that the engine generalises; it is not part of the pilot.
Bookings, guests, staff, stock and prices are test data, and every list says so.

## The Night Shift agent

- **Where:** the final agent is on **`main`** since 05:59 Sun (PR #25, merge `93f71d4`: `8de9ffc`'s
  `agent/`, byte for byte) and on the `hamad/final` branch ([`agent/`](./agent/) in Python, tests in
  [`tests/agent/`](./tests/agent/); `agent/` on this branch, `hamad/jury-loop`, is older). It plays Wybe's simulated hotel robot through Wybe's API and is scored only by Wybe's server.
  It plans on exact simulation time, reports "done" for a delivery only after the server's score rises,
  and refuses unsafe moves in code. Room checks and spill reports rest on what it saw (it looked inside;
  its sign stands over the patch), because the server credits those on the report itself; that a spill
  report is credited is a rule it learned from Saturday's nights (`spill_done` on `hamad/final`), and if
  a shift's first spill report goes uncredited it sends no more that shift. The work is done by rule-based flows per request type, found by probing an
  undocumented API; Claude is only a guarded fallback (about USD 0.001 spent all weekend).
- **Every live night of the last four builds, pinned to the commit** (Wybe practice shifts, Sun 8 Nov;
  Wybe's final ranks the mean of ten unseen nights with the worst dropped):

  | Build on `hamad/final` | Played | Score per seed | Mean |
  |---|---|---|---|
  | `d4e445c` | 00:23–00:39 | 10: 2,707 · 16: 2,564 · 23: 2,254 · 5: 2,492 · **9: 1,965 · 11: 1,914** | 2,316 (tuned seeds 2,504; seeds 9 and 11: 1,940) |
  | `cb72845` | 01:07–01:14 | 10: 2,707 · **16: 2,680** (the night in the app) · 23: 2,334 · 5: 2,584 | 2,576 |
  | `8eac151` | 01:50–01:58 | **10: 2,760** · 16: 2,679 · 23: 2,240 · 5: 2,559 | 2,560 |
  | `c3801e0`: the head of `hamad/final` at 03:30 (`8eac151`'s agent plus the end-of-night battery guard and a spill look) | 03:26 | **10: 2,760** · 16: 2,748 · 23: 2,298 · 5: 2,559 | 2,591 (not played on 9 or 11) |

  **The build that plays at 12:00 is the head of `hamad/final`: `8de9ffc` at 05:50** (`c3801e0` plus a
  corridor closed for cleaning avoided for 90 minutes instead of 30; `013f90d` has the same agent). On
  the tuned seeds (04:50) it scored 10: 2,759 · 16: 2,748 · 23: 2,298 · 5: 2,559 (mean 2,591). **The
  dress rehearsal, on ten seeds no build had ever played** (22, 34, 53, 55, 67, 70, 78, 83, 86, 93,
  started 05:02, all 10 complete at 05:50): **22: 2,085 · 34: 2,166 · 53: 2,481 · 55: 2,138 · 67: 2,312
  · 70: 2,186 · 78: 2,008 · 83: 2,236 · 86: 1,786 · 93: 1,969; the final's statistic, the mean of the
  best 9 of 10, is 2,176**, with 573 of 573 "done" credited ([`docs/runs/builds.csv`](./docs/runs/builds.csv)). If the
  head moves before 12:00, the forecast below is regenerated for it. This agent is the one on `main`
  (PR #25, merged 05:59), as the submission requires.

- **What we expect in the final: a median of 2,050, 80 % between 1,759 and 2,393, not 2,760**, for
  `8de9ffc` ([`docs/runs/forecast.txt`](./docs/runs/forecast.txt), from `python3 scripts/forecast.py`,
  regenerated 05:50 Sun with the whole rehearsal, before the final). The model is log score = build + seed, fitted on every
  complete live build night (67 build×seed cells), then 20,000 simulated finals of the best 9 of 10
  unseen seeds. Why lower than the 2,591 on tuned seeds: **mostly seed difficulty**. The four seeds the
  build played are easy ones, which alone is −19 %; the tuning penalty we can measure is about −5 %,
  from two nights (`d4e445c` on seeds 9 and 11), so it is rough, and the band now carries its
  uncertainty (drawn per simulated final) and the leave-one-cell-out error (the data review's
  correction; the earlier, narrower method gave 1,903–2,196). **Out of sample:** the forecast committed at 04:08, before the
  dress rehearsal, gave a final median of 2,035 (80 % 1,898–2,186) and a mean night of 1,989 on unseen
  seeds; the rehearsal's best 9 of 10 came in at **2,176, inside that committed interval**, and its mean
  night, 2,137, was 7 % above the forecast (2 % above it without the tuning penalty). Practice
  seeds go to 999, so a holdout was always there; the larger risk no band covers is that the final may
  use another map and other tasks (the note at the top of `docs/research/wybe-api.md`). **A second
  forecast, committed at 06:44 Sun before the final (`c6b8c54`), from the rehearsal alone: a median of
  2,170, 80 % between 2,055 and 2,301** (a posterior predictive of its ten nights; no model, no tuned
  seed). How the ten rehearsal seeds were chosen is not recorded; the seed hunt's estimates put them
  at typical, not easy (percentile ranks 8–85). After 13:05 the final goes next to both.
- **"Done" is checked, and we say what it rests on:** over the 18 nights of the four builds in the
  table the agent said "done" 1,267
  times and the referee (Wybe's server) credited 1,263, 99.7 %. But **1,078** of them were sent after
  the agent had already seen the score rise, so they are credited by construction. **On its own
  judgement it made 189 claims and 185 were credited (97.9 %): room checks 117 of 117, spill reports 68
  of 72**; the 4 misses are one probe on seed 23 repeated in every build. Those 189 are the same
  claims replayed: counted once per (seed, request), **64 of 65 distinct claims were credited (95 %
  interval 92–99.7 %)**. That is what the simulator credited, and a hotel has no simulator. **Held
  against the robot's own log, 54 of 65 hold (95 % interval 72–90 %)**: the other ten are rooms it
  reported empty after it had placed something inside them itself that night (the card's 209 rule,
  `selfContradictions`, now run over every night by `scripts/ledger.py`), and the simulator credited
  all ten; its look drops what the robot delivered. On the dress rehearsal's ten never-played seeds:
  101 of 101 own-judgement "done" credited, **88 of 101 hold against its own log**; 13 of 64 room checks
  contradicted, on 8 of 10 nights. The printed figures: [`docs/runs/summary.txt`](./docs/runs/summary.txt).
  **With the score hidden:** four live practice nights on a side branch (`hamad/blind`, Sun 04:26,
  seeds 10, 16, 23 and 5) where the agent never used the score or the referee's wording to decide
  "done", only what it saw (the place reply, the guest's answer, the sign over the spill). It made the
  same 291 "done" reports as the sighted build `c3801e0` (the same score on three seeds, +6 on the
  fourth), and the referee
  credited 290. Its own check never said "not done" on those nights (0 of 265 checks), so this shows
  the score wasn't needed there, **not how well the robot catches a failure**. **That was measured
  separately, offline, with failures injected** (side branch `hamad/faults`, `4571de3`; 20 rebuilt real
  nights × 5 draws, 13 kinds of fault, 640 nights): **the score-blind check caught 251 of 317 injected
  failures (79 %) with 5 % of actions failing**, 79 % at 15 % and 81 % at 30 %; 88 %, 87 % and 90 %
  without the sleeping-guest type ([`docs/runs/fault-bed-real.md`](./docs/runs/fault-bed-real.md)). One
  injected failure in five became a false "done". Precision over every "done" moves with how often
  things fail, so it comes second: 98.5 % (recall 99.8 %) at 5 %, 95.5 / 99.7 % at 15 %, 91.0 / 99.7 %
  at 30 % (the sighted build: 98.8 / 99.5, 96.4 / 99.0, 92.0 / 98.3). It said "not done" 256, 734 and
  1,578 times, against once with no faults. What it misses every time: a guest asleep in a room it
  checked (the look says so; the flow still reports the check done), a polite reply that doesn't
  answer, music that starts again; and some look-alike lost items. The fault bed's ground truth is the
  simulator's, so it can't see the 209 failure. The fault
  wordings are ours, so this measures the kinds of failure, not how often a real robot meets them. Over every
  live night with a log, every version, the app's judgement card recomputes the plain credited share
  from the ledger, so it moves as nights are logged. It declined 112 requests as false or impossible; the referee credited 93 of those declines
  and gave 19 nothing.
- **Board:** best practice score **2,807**, **#8 of 20** on Wybe's practice board at 04:10 Sun (top 3,448;
  we played 242 practice shifts, the leader 1,556). That night came from a board test (the `lottery`
  checkout, seed 10), a seed-specific test branch, so it is not in the final; the final branch's best,
  2,760 (`8eac151` and `c3801e0`), would sit at #11.
- **The night in the app** (`public/runs/demo.jsonl`, seed 16, 2,680, `cb72845`): 85 requests, 73
  "done", **all 73 credited**, 64 of them after the score rose and **9 on its own judgement (5 room
  checks, 4 spills), all 9 credited (95 % interval 70–100 %)**. But one of the 9 is contradicted by
  the robot's own log: at 01:29 it placed luggage-209 inside room 209, and at 03:47 it reported the room
  "empty and tidy" (R-049), which the referee credited. So the card says **8 of 9 hold against its own
  log**: the simulator's look is a text oracle, and a real room check has false negatives. 8 declined,
  of which the referee credited 7 (6 orders that never existed, 1 already delivered) and not 1 (a spill
  report on floor 3); 4 still open at 06:00; one penalty (−15, it slipped on a wet floor at 23:51).
  At 06:00 it is not docked and still holds the master keycard (battery about 20 %): the handover lists
  that as an item with an owner.
- **What hotel rules cost** (asked for in the domain reviews): a knock before every keycard entry, no sign moved off a
  wet floor, known wet corridors avoided. The build that plays still does all three for Wybe's game
  (`sign_move` is on, the bags flow enters with the master key, a known wet corridor is priced at its
  sim cost); a pilot runs with them off. **The cost in Wybe's sim, measured in the replay bed** (164
  real nights, side branch `hamad/hotelrules`, `70d5be4`): all four rules together **−125.8 points a
  night** (−100.4 weighted per seed), no strands. Most of it is one rule: never moving a sign off a wet
  floor costs −105.2, because the store holds three signs, so across the 164 nights the robot declined
  415 spill reports for "no sign left"; a knock before every keycard entry costs −12.4; signing a patch nobody reported
  −30.1; avoiding a known wet corridor 0 (with the cart there is no dry way round). So the safe rule is
  nearly free with a stock of signs on every floor, which is what a hotel would do. **Live on Wybe's
  server** (hotel-rules mode, `NS_HOTEL_RULES=1` on `70d5be4`, four nights complete at about 05:55 Sun,
  seeds 10/16/23/5): **2,605 · 2,584 · 2,393 · 2,453 against the final build's 2,760 · 2,748 · 2,298 ·
  2,559 on the same seeds, mean 2,509 against 2,591: −82 points a night**, less than the replay's
  −125.8. It knocked before **59 of 59** keycard entries (the final build on the same seeds: 26 of
  61; both counted from the logs with the card's own rule, `masterKeyEntries`). The rows are in
  [`docs/runs/builds.csv`](./docs/runs/builds.csv) (commit `70d5be4`); the card shows the same numbers
  behind *Slik vet vi det* (`src/features/nightshift/data/hotel-rules.json`).
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

Overnight the build was steered by our own structured reviews, AI-assisted, one per judging field
(design, security, product, legal, domain, data, marketing, founders). They are internal reviews, not
the jury, and the docs name the field, never a person. They are not user tests: those are in
`docs/DEMO.md` § 8, still **PENDING**.

| File | What's in it |
|---|---|
| [`docs/DEMO.md`](./docs/DEMO.md) | The pitch, the 2-minute script, the agent's numbers, the business slide, each review's question with an honest answer, the Sunday user test |
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
