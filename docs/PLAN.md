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
- [ ] Invite accepted, `setup.sh` run, first small PR (own lane in `MEMORY.md`). [owner: ShirazIQ]
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
- [~] **Wybe API recon:** done in practice mode only (`{"mode":"practice","seed":1}`, 2 shifts, no final
      call); the subagent died before writing it up, so a second one is writing the reference from
      the raw log (`temp/wybe/`, gitignored). Original scope:
      every command with its arguments and replies, the task types, the hotel map (floors, rooms,
      lifts), what counts as done, what costs points, and the timing (20 s per action). Written to
      `docs/research/wybe-api.md`. [owner: Hamad, now, to unblock Track A]
- [ ] Design spec `docs/superpowers/specs/2026-11-07-fettero-design.md`, approved by both of us.
      [owner: Hamad]
- [ ] One implementation plan per track (`superpowers:writing-plans`) in `docs/superpowers/plans/`.
      [owners: per track]
- [ ] `PRD.md`, `ARCHITECTURE.md` (stack, contracts, env vars) and `DESIGN.md` filled from the spec;
      `scripts/check.sh` pinned to the stack's commands. [owner: Hamad]
- [ ] **Matches the brief** · [ ] **Seen working** (the Wybe API map tried for real)

## Phase 2 — Build: three tracks in parallel (Sat ~13:00 → Sun 11:00)

Each track runs its plan with `superpowers:subagent-driven-development`. Tasks below are the
outline; the plans hold the detail. Tasks may change after the recon.

### Track A — Night Shift agent [owner: ShirazIQ; Hamad leads the design, started 2026-11-07 12:15]

- [ ] **API client** for every discovered command: timeouts, retries, and every request and reply
      logged to `temp/` (gitignored) so a shift can be replayed.
- [ ] **World model:** floors, rooms, items, robot position and the task inbox, kept up to date from
      `status` / `inbox` (they don't reset the 20 s timer).
- [ ] **Planner:** picks the next task by points against time, the shortest route across floors, and
      several tasks on one trip.
- [ ] **Safe executor:** checks each step against the server's reply. **Never reports "done" unless
      the server confirms it**, refuses unsafe actions, and asks Claude for judgement on surprises.
- [ ] **Speed:** every action well under 20 s, measured. Plain code for routine moves; Claude only
      where judgement is needed.
- [ ] **Cost guard:** counts Claude API spend per shift and in total, and stops before the USD 30
      cap (`ANTHROPIC_BUDGET_USD`).
- [ ] **Parallel runner:** starts N shifts at once (`mode: "final"` on Sunday), each isolated, under
      the API rate limits.
- [ ] **Score loop:** run practice shifts, read the score and the logs, fix the worst failure, repeat.
- [ ] **Final runbook** in `OPERATIONS.md` § 7: the exact command that starts all 10 at 12:00, who
      watches, what to do if one stops.
- [ ] **Matches the brief** · [ ] **Seen working** (on the practice leaderboard; 10-shift dry run)

### Track B — Fettero app [owner: Hamad]

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

### Track C — Pitch and demo [owner: Hamad, ShirazIQ helps]

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

- [ ] **ShirazIQ on Track A (the Wybe hotel agent)?** That's Claude's reading of "the other guy will
      do the hotel development". Confirm or swap.
- [ ] **Holio:** does solving 3, 6 and 9 together count for or against us? Their text says "pick
      one". Ask the Holio juror (Head of Holio) at the panel or the stand.
- [ ] **Holio:** demo time, test data, judging criteria, a Zebra TC27 on loan? (left blank in their
      document)
- [ ] **Organisers:** how is "all files" delivered on Sunday (zip, repo link, Discord)?
- [ ] **Organisers:** is a library installed with a package manager fine under "existing code: not
      allowed"? (Our reading: yes; we never paste code from other repos.)
- [ ] **Wybe:** any rate limit on requests, or a limit on practice shifts? (They may answer "ask the
      robot".)
