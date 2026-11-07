# PLAN.md — Team Fettero's roadmap

> **Oslo Sprint, 6–8 Nov 2026 · Build deadline Sun 8 Nov 14:00 · Repo:
> https://github.com/haakram/oslo-sprint-26 (private)**
>
> **Two builds, one story** (details in `docs/CONTEXT.md`):
>
> - **A. Night Shift agent:** the AI brain that plays Wybe's simulated hotel robot **on its own**:
>   towels, lost items, room checks, surprises. Scored only by the Wybe server: completed tasks,
>   speed, no false "done", no unsafe moves. **Must be finished Sun 11:45**; the final is 10 secret
>   shifts at 12:00–13:00. Prize NOK 10,000.
> - **B. Fettero app:** the robot's eyes, routes and voice. A live camera with boxes that recognises
>   products (soap, shampoo, food) without a barcode, the shortest route across floors, and talking
>   and translating with ElevenLabs. Pitched for the main prize (NOK 50,000), Holio pains **3, 6
>   and 9** (NOK 10,000) and ElevenLabs. It also shows the agent's shifts live, which ties A and B
>   into one pitch.
>
> **How we build: subagent-driven development** (CLAUDE.md, team standard). Every piece goes
> design (`superpowers:brainstorming`) → plan (`superpowers:writing-plans`, saved in
> `docs/superpowers/plans/`) → build with `superpowers:subagent-driven-development`, independent
> tasks in parallel subagents. Use as many subagents as help. Claude API spend by our product is
> capped at **USD 30** for the whole event.
>
> **Claiming and ticking:** put your name in `[owner: …]` before you start. States: `[ ]` open ·
> `[x]` done and verified · `[~]` done with a caveat (say what) · `[-]` dropped (say why). A done task
> gets one line on what was verified and the PR number.
>
> **Every phase closes with two gates:** (1) **Matches the brief**: re-read against `PRD.md` and
> `CONTEXT.md` § 3; (2) **Seen working**: run for real, screenshots or logs in `temp/`.
> Plan wrong? AI_RULES R6.3: propose an amendment, don't rewrite.

---

## Join the team (share this section)

For a new teammate. ShirazIQ was invited on 2026-11-07.

1. **Accept the GitHub invite:** https://github.com/haakram/oslo-sprint-26/invitations (or the
   e-mail from GitHub).
2. **Tools:** Claude Code, up to date (`claude update`) · git · GitHub CLI (`brew install gh`, then
   `gh auth login`) · gitleaks (`brew install gitleaks`).
3. **Clone and set up:**

   ```bash
   git clone https://github.com/haakram/oslo-sprint-26.git
   cd oslo-sprint-26
   ./scripts/setup.sh
   ```

   That turns on the git hooks, creates `.env`, and installs the team's Claude Code plugins
   (superpowers, frontend-design, chrome-devtools-mcp, diagram-design).
4. **Keys** (Wybe, Anthropic, ElevenLabs) never go through GitHub. Hamad runs
   `./scripts/secrets.sh copy` and sends you the result privately (AirDrop, or a one-time
   password-manager share). You copy what arrived and run `./scripts/secrets.sh paste`: it writes
   them into `.env` and clears the clipboard. Check with `./scripts/secrets.sh status`.
5. **Start Claude Code in the folder** (`claude` in the terminal, or the VS Code extension). Approve
   the Playwright and Context7 servers when it asks. Then paste the **next-chat prompt** from the
   newest file in `docs/sessions/`, or type **`/kickoff`**.
6. **Work on a branch** `<name>/<topic>`, never on `main`. End every session with **`/handoff`**: it
   saves a session note, pushes, merges into `main` when CI is green, and leaves the prompt for the
   next chat.

---

## Checkpoints (Europe/Oslo)

| When | Checkpoint |
|---|---|
| **Sat 12:00** | Team name **Fettero** and team photo handed in |
| Sat ~13:00 | Wybe API mapped · design spec approved · plans written |
| Sat ~16:00 | Walking skeletons: the agent completes one task in a practice shift; the app shows camera boxes and a map |
| **Sat 16:00–17:00** | Jury panel: ask Wybe and Holio the questions in § Team review list |
| Sat ~21:00 | Agent on the practice leaderboard · all three Holio flows work end to end |
| Sat 23:30 | Venue closes: `/handoff` from both of us |
| Sun 09:00 | Tune the agent on practice shifts · app polish · pitch deck |
| **Sun 11:00** | Agent freeze: dry run of 10 parallel practice shifts |
| **Sun 11:45** | Wybe practice closes |
| **Sun 12:00** | Start all 10 final shifts |
| Sun 13:30 | App freeze · submission package ready |
| **Sun 14:00** | **Build deadline: deliver all files** |
| Sun 14:15+ | Mini-pitch: 2 min + 1 min questions |

---

## Phase 0 — Bootstrap

**Goal:** a repo both of us can clone, set up with one command, and push to safely.

- [x] Folder structure, docs, hooks, CI and scripts from the Glimto template. [owner: Hamad]
- [x] `CONTEXT.md` filled from the kickoff deck, the Wybe guide, the Holio document and the Discord
      posts. [owner: Hamad]
- [x] Shared AI setup: plugins via `setup.sh`, the Scrapling skill, Playwright and Context7 (tested
      on a fresh machine with Claude Code 2.1.319). [owner: Hamad]
- [x] Private GitHub repo `haakram/oslo-sprint-26` created, ShirazIQ invited with write access.
      [owner: Hamad]
- [-] `./scripts/protect-main.sh`: dropped. GitHub's free plan has no branch protection on private
      repos; the local hooks and the team rules protect `main`.
- [ ] Team name **Fettero** and photo handed in by Sat 12:00. [owner: Hamad]
- [x] Invite accepted, `setup.sh` run, first small PR (own lane in `MEMORY.md`). [owner: ShirazIQ]
      Verified: `setup.sh` showed all 4 plugins ✓, `secrets.sh status` shows all 3 keys set. PR: this one.
- [ ] **Matches the brief** · [ ] **Seen working**

## Phase 1 — Recon and design (Sat, until ~13:00)

**Goal:** we know exactly what the Wybe robot understands, and the design is written down well
enough that two people and their subagents can build in parallel.

- [x] Wybe endpoint and key in `.env` (`WYBE_NIGHTSHIFT_URL`, `WYBE_NIGHTSHIFT_KEY`). Protocol found:
      `POST https://nightshift.wybe.me/`, `Authorization: Bearer <key>`, body
      `{"cmd":"<command>","args":{…}}`. Pre-shift commands: help, whoami, start_shift, shifts,
      leaderboard. [owner: Hamad]
- [x] Anthropic key in `.env`; ElevenLabs connected through its CLI (key in `.env.local`). Keys reach
      teammates only through `scripts/secrets.sh`; a guard in the pre-commit hook and `check.sh`
      blocks this machine's own key values from any commit (tested with fake keys). [owner: Hamad]
- [x] **Wybe API recon:** reference in `docs/research/wybe-api.md` (written from the live recon). Notes: done in practice mode only (`{"mode":"practice","seed":1}`, 2 shifts, no final
      call); the subagent died before writing it up, so a second one is writing the reference from
      the raw log (`temp/wybe/`, gitignored). Original scope:
      every command with its arguments and replies, the task types, the hotel map (floors, rooms,
      lifts), what counts as done, what costs points, and the timing (20 s per action). Written to
      `docs/research/wybe-api.md`. [owner: Hamad, now, to unblock Track A]
- [x] Track A design spec `docs/superpowers/specs/2026-11-07-nightshift-agent-design.md` and plan
      `docs/superpowers/plans/2026-11-07-nightshift-agent.md`. [owner: Hamad]
- [ ] Track B design spec `docs/superpowers/specs/2026-11-07-fettero-app-design.md` (start from
      `docs/research/elevenlabs-2026-11.md`). [owner: ShirazIQ]
- [ ] One implementation plan per track (`superpowers:writing-plans`) in `docs/superpowers/plans/`.
      [owners: per track]
- [ ] `PRD.md`, `ARCHITECTURE.md` (stack, contracts, env vars) and `DESIGN.md` filled from the spec;
      `scripts/check.sh` pinned to the stack's commands. [owners: each for their track]
- [ ] **Matches the brief** · [ ] **Seen working** (the Wybe API map tried for real)

## Phase 2 — Build: three tracks in parallel (Sat ~13:00 → Sun 11:00)

Each track runs its plan with `superpowers:subagent-driven-development`. Tasks below are the
outline; the plans hold the detail. Tasks may change after the recon.

### Track A — Night Shift agent [owner: Hamad]

Spec: `docs/superpowers/specs/2026-11-07-nightshift-agent-design.md` · plan (12 tasks, built with
subagents): `docs/superpowers/plans/2026-11-07-nightshift-agent.md` · facts: `docs/research/wybe-api.md`.
Also a **3D hotel viewer** to watch shifts live or replayed (plan Task 11), which Track C can use in the demo.


- [x] **API client** for every discovered command (plan Task 2, reviewed): timeouts, retries, and every request and reply
      logged to `temp/` (gitignored) so a shift can be replayed.
- [x] **World model** (Task 3; seed-1 map exact, corrected from `look`): floors, rooms, items, robot position and the task inbox, kept up to date from
      `status` / `inbox` (they don't reset the 20 s timer).
- [~] **Planner** (Task 8; value per second; batching several tasks per trip not yet): picks the next task by points against time, the shortest route across floors, and
      several tasks on one trip.
- [x] **Safe executor** (Task 7; one report-done site, always behind a score rise): checks each step against the server's reply. **Never reports "done" unless
      the server confirms it**, refuses unsafe actions, and asks Claude for judgement on surprises.
- [x] **Speed** (live: ~1,650 calls for a full night in minutes): every action well under 20 s, measured. Plain code for routine moves; Claude only
      where judgement is needed.
- [x] **Cost guard** (Task 9; file-backed ledger, fails closed; Console limit USD 30 set): counts Claude API spend per shift and in total, and stops before the USD 30
      cap (`ANTHROPIC_BUDGET_USD`).
- [x] **Parallel runner** (Task 10; tested offline with the guard opened in-test): starts N shifts at once (`mode: "final"` on Sunday), each isolated, under
      the API rate limits.
- [~] **Score loop** (1 live night: 581 points; Task 13 for the new request types in progress; offline tune not yet calibrated): run practice shifts, read the score and the logs, fix the worst failure, repeat.
- [x] **Final runbook** in `OPERATIONS.md` § 7 (Task 10): the exact command that starts all 10 at 12:00, who
      watches, what to do if one stops.
- [ ] **Matches the brief** · [ ] **Seen working** (on the practice leaderboard; 10-shift dry run)

#### Road to #1 on the Wybe leaderboard (team lead, 2026-11-07 ~14:00) [owner: Hamad]

The #1 team's 3,448 over seed 1's 68 requests is ~50 points per request. We scored 581 because we
failed 39 of 68 requests (unknown types), not because we were slow (the robot idled ~60 %). So: handle
every request, then handle it fast. Few live runs: each one answers a specific question.

- [ ] 1. Review + merge Task 13 (WIP `574f22d` on `hamad/na-t13`): every new request type.
- [ ] 2. ONE live run on seed 1 (same night, same requests): the score deltas show which hypothesis
      earns points; keep what scores, fix what doesn't. Per-hypothesis table → wybe-api.md § 13.
- [ ] 3. Calibrate the offline fake to the real night (request mix and rate, cart 8, slips −15, end
      06:00) so offline tuning means something.
- [ ] 4. Speed = points (a fast delivery ~45, a slow one ~21): **batching** several requests per trip
      with the stocked cart in best-route order; use idle time (restock, wait near the elevator, not
      the far dock). Tune offline.
- [ ] 5. Validate on other nights: 1–2 live runs on seed 2 (and 3) so we don't overfit seed 1 — the
      final's 10 shifts are secret.
- [ ] 6. Sun 11:00 freeze, 10-shift offline dry run; 12:00 `FINAL_ARMED=1 .venv/bin/python -m agent final`,
      watch in the viewer.

Target: past the median (~2,400) after steps 1–2; steps 3–5 decide the top. Live runs: ~4–5 total.

### Drift — the 06:00 handover dashboard (team lead, 2026-11-07 ~13:40)

Design and the 2-minute demo script: `docs/superpowers/specs/2026-11-07-ops-dashboard-design.md`.
One story, five beats: the night on the room grid → send the cleaners → count the linen → the guest
speaks up → close. Every beat solves a named hotel problem and maps to a prize.

- [~] **Track A:** the agent logs `room_status` and `work_order` decisions (in Task 13: WIP 574f22d on hamad/na-t13, awaiting review) (additive run-log
      `[contract]`, ARCHITECTURE § 4.3). [owner: Hamad]
- [x] **Track A:** viewer CORS for the app's local origin (Task 14, merged) (`http://localhost:3000`) on `/api/*`, as
      ShirazIQ asked in PR #7. [owner: Hamad]
- [ ] **Track A:** hand over the demo run log from the next practice run (with the new decisions) as
      `public/runs/demo.jsonl`. [owner: Hamad]
- [ ] **Track B:** `/drift` screen: room grid, work-order feed, linen card, *Send renholderne* on the
      existing tour engine, score strip. [owner: ShirazIQ]
- [ ] **Track B:** voice tool `create_work_order` (proposes; *Bekreft* to add) + the guest check
      ("Is everything else all right with the room?"). [owner: ShirazIQ]
- [ ] **Track B:** linen count: `POST /api/count-linen` (Claude vision, metered) + expected stock
      (test data) + a *lin* work order on deviation. [owner: ShirazIQ]
- [ ] **Track C:** the 2-minute script into `docs/DEMO.md` § 2 and rehearsed twice against a timer;
      sources for the hook's numbers found or the wording softened. [owner: ShirazIQ]

### Track B — Fettero app [owner: ShirazIQ]

- [ ] **Skeleton:** the stack from the spec, a deployed URL, API keys kept on the server side.
- [ ] **Eyes (Holio 3):** live camera with boxes and labels in real time. Tap a box and Claude
      identifies the product (soap, shampoo, food …) from the image or the text on the pack, with no
      barcode needed.
- [ ] **Routes (Holio 6):** a map of several floors (hotel floors or warehouse aisles) and the
      shortest route through several stops, with the distance saved against walking them in order.
- [ ] **Voice (Holio 9 + ElevenLabs):** speak to the robot, Claude turns it into a command, and the
      robot answers out loud with ElevenLabs. It translates for a guest or a new worker in their own
      language.
- [ ] **Mission control:** the agent's live shift (tasks, position, decisions) from Track A's logs.
- [ ] **Matches the brief** · [ ] **Seen working** (the demo story end to end on the deployed URL)

### Track C — Pitch and demo [owner: ShirazIQ, Hamad helps]

- [ ] Questions for Wybe and Holio ready for the Sat 16–17 panel (§ Team review list).
- [ ] `DEMO.md`: the 2-minute pitch script, each part tied to a prize's judging.
- [ ] Deck and an architecture diagram (`diagram-design`).
- [ ] Backup demo video.
- [ ] Props for the camera demo: soap, shampoo, food, a towel.
- [ ] **Matches the brief** · [ ] **Seen working** (pitch rehearsed against a timer)

## Phase 3 — Freeze, final and hand-in (Sun 11:00 → 14:15)

- [ ] 11:00 agent freeze; 10-shift practice dry run passes.
- [ ] 12:00 all 10 final shifts started; progress watched; no hand-steering (Wybe rule).
- [ ] 13:30 app freeze; `README.md` tells a judge what this is and how to run it.
- [ ] All files delivered by 14:00, in the way the organisers ask (CONTEXT § 2, rule 5).
- [ ] 14:15 pitch.

---

## Team review list

> Open questions, decisions made on the fly, parked bugs. Add a line instead of blocking.

- [x] **Owners** (team lead, 2026-11-07 12:25): Hamad builds Track A (the Night Shift agent: route
      finding, task planning); ShirazIQ builds Track B (UI, camera, ElevenLabs) and Track C (demo).
- [ ] **Holio:** does solving 3, 6 and 9 together count for or against us? Their text says "pick
      one". Ask the Holio juror (Head of Holio) at the panel or the stand.
- [ ] **Holio:** demo time, test data, judging criteria, a Zebra TC27 on loan? (left blank in their
      document)
- [ ] **Organisers:** how is "all files" delivered on Sunday (zip, repo link, Discord)?
- [ ] **Organisers:** is a library installed with a package manager fine under "existing code: not
      allowed"? (Our reading: yes; we never paste code from other repos.)
- [ ] **Wybe:** any rate limit on requests, or a limit on practice shifts? (They may answer "ask the
      robot".)
- [ ] **Repo visibility for the jury:** the jury reads the commit history; the repo is private. Make
      it public or give the jury access before Sun 14:00 (team lead's decision; CONTEXT § 11).
- [ ] **Mock jury (12 jurors) — re-run next session**; 3 of 12 finished: `docs/checks/jury-2026-11-07.md`.
- [ ] **Business slide** (Founders juror: 3/10): one buyer, one price, one next step, sourced numbers.
- [ ] **Cut the demo to three beats?** (Product juror): night → work orders, send cleaners, Spanish complaint → work order; linen count and the Polish cleaner to Q&A.
