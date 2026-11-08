# PRD.md — Product requirements

> **Draft for team review (Hamad, ShirazIQ), updated Sun 8 Nov morning from what is built on
> `hamad/jury-loop` (app) and `hamad/final` (agent).** It describes the product as it stands, not a
> wish list. Changes only by team agreement (AI_RULES R2); an AI that wants to add something not listed
> here stops and asks. Lines marked **[decide]** need the team. The product trades as **Fettero** on this
> branch (the team lead decides whether `main` follows); code identifiers keep the old `lobby` names.

## 1. One-line description

**Fettero** helps **the hotel's 06:00 handover manager** **take over the night in a minute, sell the
rooms that are free and hand on what is still open** by **turning the night robot's run log, the AI
receptionist's calls and the staff's notes into one signed handover page, where nothing says "done"
unless it was confirmed.** The one line: *Natten, ærlig overlevert.*

## 2. Who it's for

**Primary user: the night manager or front-office lead who takes over the hotel at 06:00**, at a desk
or on an iPad, in a hotel of 60–200 rooms **[decide: size band is our assumption]**. Often new in the
job, sometimes working in a second language. Needs to know which rooms can be sold, which guest is
still waiting, what broke or went wrong overnight, and who does what next.

**Buyer (signs the contract): the hotel's general or operations manager** of an independent or chain
hotel in that band. The buyer reads money: rooms released for sale, kroner recovered. The user reads
"nothing is lost at 06:00". Price, channel and the first 100 users: `docs/DEMO.md` § 7.

Secondary users the app serves (shown only in Q&A, not in the 2-minute demo):

- **Resepsjonist**: the receptionist's calls, booking requests and messages (role `receptionist`).
- **Robotansvarlig**: the person who looks after the robot: 3D-kart, Natteskift, Øyne, Stemme (role `robot`).
- **Short-let host or property manager** (role `host`, `/vert`): the same engine for 4 flats in Oslo,
  on test data. A second, self-serve market we built to test that the product generalises; it has its
  own login and is not in the hotel admin's menu.

## 3. The problem and why now

**The pain, as we read it (not yet confirmed by a hotel: see § 8 and `docs/DEMO.md` § 8):** at 06:00
the night's events are spread over the robot, the phone, staff notes and the PMS. Rooms that are empty
but marked occupied ("sleepers") can't be sold until someone finds them; a guest whose request failed
is still waiting; safety events and faults surface late.

**Evidence we can cite** (links in `docs/DEMO.md` § 1):

- Staff churn: even in a normal year, under 11 % of the people who had worked in Norwegian
  accommodation and food service every month from Nov 2018 to Feb 2019 had left the industry by June
  2019; about 40 % of the stable workforce is part-time (SSB analyse 2023/9). The handover reader is
  often new.
- Every room counts: Norwegian hotels' average room rate was NOK 1,444 in 2025, occupancy 62.5 %,
  RevPAR NOK 903, all records (Hotelloversikten 2025).
- Guests in many languages: 26.7 million hotel guest nights in Norway in 2024, a record; foreign hotel
  nights up 14 % (SSB, 4 Feb 2025).
- Linen: hotels can lose or discard 15–20 % of linen before the end of its useful life (TRSA research,
  cited by Hotel Management Network, Aug 2026), though no reliable global benchmark exists.

**Why now:**

1. AI agents are moving into hotel operations, but almost no one can prove the return: 91 % of hotel
   chains use AI, 13 % report measurable ROI (h2c, Oct 2026). A layer that shows what the machines did
   and didn't do, with its arithmetic, is the missing piece.
2. Hospitality robot sales fell 11 % in 2024 while service robots grew (IFR): the hardware exists; the
   software that gives a robot hotel work, keeps it safe and checks it is the bottleneck.
3. Modern PMSs automated the night audit; the human handover is still paper, PMS notes and chat.

**What our agent shows, honestly:** it ran Wybe's live simulation on its own with rule-based flows per
request type (found by probing an undocumented API), safety rules in code, "done" reported only after
the server's score rose, and Claude only as a guarded fallback (about USD 0.001 spent all weekend).
Numbers per build, pinned to commits on `hamad/final`, not a best night: the final build's agent code
(`8eac151`) averaged 2,560 on its four tuned seeds (best 2,760, seed 10). The only build that played
seeds it was never tuned on (`d4e445c`) scored 1,940 on seeds 9 and 11 against 2,504 on its tuned
seeds, so we forecast **about 2,000 (1,900–2,100)** for the final's unseen nights. Over the 14 live
nights of the last three builds the referee credited 973 of 976 "done" reports (99.7 %). Best practice
score on the board: 2,798, #9 of 20 at 02:47 Sun, from a test branch that is not the final build. On
the night in the app (seed 16, 2,680, `cb72845`) it reported "done" 73 times and the referee credited
all 73. Full table and the replay bed's limits: `docs/DEMO.md` § 1.1.

## 4. The demo story

Same as `docs/DEMO.md` § 2 (2:00, one user, one story: Siri takes over from Kjersti and the robot):

1. **Overlevering 06:00** (0:00–0:20): the night on one page; what's open, each item with an owner and
   a deadline.
2. **Rom → Robotens romsjekk mot bookingsystemet** (0:20–0:45): *2 rom kan selges i dag · ca. 2 900
   kr* (2 × the test PMS's average rate); *Merk som ledig for salg*. The robot proposes, the manager
   releases.
3. **Forespørsler → Ta saken** (0:45–1:05): a request the robot genuinely didn't finish (its battery
   hit 9 % at 05:29; four requests were open at 06:00, each with its reason) is taken over by a person,
   with *Angre*.
4. **3D-kart at 04:15** (1:05–1:25): the robot's real night replayed from its run log; a man in a
   bathrobe asks it to open room 304.
5. **Robotens vurderinger i natt** on Natteskift (1:25–1:50): seven refusals to let a stranger into a
   room, grouped as one incident; 73 of 73 "done" confirmed by Wybe's server; eight false claims
   declined.
6. **Kvitter mottatt** (1:50–2:00): the morning manager signs.

## 5. Scope (as built)

### Must (the demo breaks without it) — built

- **Login with roles** (admin, resepsjonist, robotansvarlig, host), enforced on the server
  (`src/proxy.ts`, `src/features/auth/`), plus a separate `jury` account for the event.
- **Overlevering 06:00**: what happened, *Åpent nå* with an owner and a deadline per item, rooms ready
  to sell with their value, *Godkjent av Wybe-serveren*, the night receptionist's note and *Kvitter
  mottatt* (`src/features/handover/`).
- **Rom og renhold** with **Robotens romsjekk mot bookingsystemet**: the robot's room checks
  reconciled with the (test) PMS; a room must be empty after 01:00 before it is suggested for sale
  (`src/features/rooms/`).
- **Forespørsler**: everything guests asked for, from the robot, the AI receptionist (a call becomes a
  task), staff and voice; *Ta over* / *Ta saken* and *Angre*; the robot's outcomes split by reason
  (done, not finished, correctly declined, cancelled by the manager) (`src/features/requests/`).
- **One selector for the night**: every screen reads task totals and occupancy from the same run log
  and the same test data, so the numbers agree across screens.
- **3D-kart** (three.js replay of the night) and **Natteskift** (the night step by step, outcomes with
  reasons, *Godkjent av Wybe-serveren*, and the card *Robotens vurderinger i natt*: refusals of a
  stranger grouped as one incident, confirmed "done", claims declined after a check, wet-floor signs,
  Do-Not-Disturb doors) (`src/features/hotel3d/`, `src/features/nightshift/`).
- **The run log** of a real live practice night of the final agent (`public/runs/demo.jsonl`, seed 16).
- **The Night Shift agent** (`agent/` on `hamad/final`): plays Wybe's simulation on its own, scored by
  Wybe's server.

### Should (makes the demo clearly better) — built

- **Oversikt**: a greeting, the night in one sentence, six figures with a source line (from the robot's
  log, test data or an estimate) and the link *Se overleveringen*; one widget per module
  (`src/features/dashboard/`). *Timer spart* is shown as *ca.* with *Slik regner vi*.
- **The bell** (*Varsler*): only what needs a person, safety first (an unsigned wet floor on top); red
  and amber appear only here.
- **Ruter**: shortest cleaning round and the robot's walk per task across floors, by lift with a cart,
  using a TypeScript port of the agent's router with parity tests (`src/features/routes/hotelRouter.ts`);
  a seeded unsorted list shows the metres saved against the list order.
- **Vedlikehold**: work orders by priority, the robot's findings and staff reports; *Tildel*, *Marker
  løst* (statuses kept in the browser).
- **Gjester og bookinger**, **Lager og lin**, **Ansatte og vakter**: on test data, marked on screen.
- **Resepsjon**: the ElevenLabs AI receptionist (configured for 38 languages, says it is an AI, quotes
  the direct price, haggles in fixed steps at most 10 % under it, records booking requests and messages
  for staff to confirm, never takes card numbers) and its call log, phone numbers masked.
- **Robotens øyne**: live camera boxes on the device, products identified by Claude without a barcode,
  *Vis vei* to the product's shelf. Holio pain 3 (`docs/HOLIO.md`).

### Could (only once every must and should is stable) — partly built

- **Snakk gjennom roboten**: staff speak their language (eleven), the robot answers aloud; proposed
  robot tasks need *Bekreft*. Built, but **not connected** (no agent id set), so it is hidden or marked
  in the menu; guest-to-staff translation is not built. Holio pain 9 at demo level only.
- **Utleie** (`/vert`): the host's own app (flats, turnovers, guest messages translated, bookings,
  supplies), test data only.
- **Live mode (*Direkte*)**: follows a running shift through the agent's local viewer; local only.
- **Plukkliste** in Ruter: a seeded order on a 4-shelf test warehouse map (`TODO(phase-2)`).
- **Send roboten** from Forespørsler: puts the task in the robot's queue in this browser only, and says
  so (*sendes når roboten er koblet til*, `TODO(phase-3)`); nothing reaches a robot yet.

## 6. Out of scope — cut, with the reason

- **PMS, inventory, staff-planning and maintenance integrations.** Test data stands in, marked
  `TODO(phase-3)` in code and with a `SourceNote` on screen. The PMS test data was written after we saw
  the robot's log, to show what the join does; in a pilot it reads the hotel's PMS. Integration is pilot
  work, not demo work.
- **A database or shared backend.** Statuses, sign-offs and receptionist records live in the browser
  (`localStorage`); one desk doesn't see another's ticks, and *Kvitter mottatt* is not an audit record
  yet. A pilot writes these as append-only events beside the robot's.
- **Payments.** The receptionist records requests; staff confirm and take payment. No card data, ever.
- **Real robot hardware, and the sim-to-real gaps** we name rather than hide:
  - *Done* is gated by Wybe's score rising; a hotel has no score. A pilot needs evidence instead (lock
    audit log, the guest's acknowledgement, a photo of the item, a cart slot going empty, the clerk's
    confirmation); anything without evidence shows as not confirmed, for a person.
  - In the simulation the robot fetches a master keycard and checks rooms the PMS shows as occupied. In
    a pilot it does not open occupied rooms: occupancy comes from the door-lock audit trail and the
    keycard energy slot, the robot only knocks or checks rooms the PMS already shows as vacant, and keys
    ride in a locked compartment. Already in the build: a room is offered for sale only after the desk
    confirms the check-out (two steps, never one tap), and a room the robot delivered to later in the
    night (an arriving guest's bags in 209) is held back as a likely double allocation, never offered.
  - The simulation's score pays for habits a hotel wouldn't want: declining a guest's "it never came"
    when there is no order (the guest still has no water), running the battery to 8.6 % before 06:00,
    and moving a wet-floor sign to a newer spill when the robot is out of signs (`sign_move`, still on in
    the agent). Fettero turns those into decisions and open items for a person; a real deployment keeps a
    battery reserve and never takes a sign off a wet floor.
  - Lifts and doors need a per-building integration with the lift maker's API: the pilot's hard part,
    not "only the API adapter changes".
- **Linen counting by camera** (Drift spec "should"): cut for time; Lager og lin shows test stock.
- **Voice complaint → work order** (`create_work_order`, Drift spec "must"): cut; voice proposes
  robot tasks only.
- **Translation between guest and staff** in Stemme: the next step, not built.
- **A warehouse mode** for Holio (warehouse map, a real catalogue, bin-label confirmation): not built;
  the Holio status is in `docs/HOLIO.md`.
- **Self-service sign-up, password reset, user admin**: accounts from an env var.
- **Multi-hotel, native mobile apps, email/SMS notifications, a live phone number** (the webhook route
  exists; the deployed app has no secret set, so calls stay in the browser).
- **Face recognition or guest identification**: never, by design.
- **Editing the agent from the app.** The app reads the run log; it never steers the robot.

## 7. Success criteria

- The demo story (§ 4) runs end to end three times in a row, from a laptop that isn't the builder's,
  inside 2:00.
- **Functionality:** every beat is live; nothing on screen is a screenshot. Data sources are labelled;
  every screen shows the same totals for the same night.
- **A real problem:** the hook uses only sourced figures (`docs/DEMO.md` § 1) and, if the Sunday phone
  round ran, its real tally with date and count; no unsourced claim.
- **Innovation:** the agent's numbers are real and checkable in its run logs (the distribution in
  `docs/DEMO.md` § 1.1; 73 of 73 "done" confirmed on the night shown; one penalty on that night).
- **Design:** a juror understands Overlevering without narration (the hallway test in `docs/DEMO.md`
  § 8.2: three people, time to the first right tap) **[decide: who runs it]**.
- **Team efficiency:** the cut list (§ 6) is said aloud when asked; the gate (`./scripts/check.sh`) is
  green on `main` at 14:00.
- **Wybe:** all 10 final shifts started at 12:00, none scored 0 for not starting.

## 8. Open questions

- **[decide]** The business slide (`docs/DEMO.md` § 7): buyer 60–200-room hotels, NOK 30 per room per
  month, first channel. Proposals until the team agrees.
- Have we any hotel person to quote? None so far. The phone round and hallway test (`docs/DEMO.md`
  § 8) are planned for Sunday morning: who runs them?
- Does `main` trade as Fettero too? (Team lead.) The public URL, lobby-sandy.vercel.app, serves `main`
  under the old name and an older CSP; `hamad/jury-loop` isn't deployed (team lead's rule).
- The name isn't cleared. A quick web check on Sun 8 Nov found FETTERO registered in the US for
  jewellery (class 14, no conflict with software) and FETUERO registered in the US in class 9
  (software), close enough to need a proper search: Patentstyret, EUIPO TMview and WIPO in classes 9,
  42 and 43, plus fettero.no and fettero.com. Until then we don't say "clear".
- **[decide]** One wedge for the business slide (hotels first, software only; or robot makers first),
  and one line on commitment and a stop rule (`docs/DEMO.md` § 3 and § 7).
- Does Holio count three pains in one product for or against us? (CONTEXT § 6, still open; ask at the
  Holio stand before 14:00.)
- Repo public, or jury access by invitation, before 14:00? (CONTEXT § 11.) The jury account's password
  goes in the `/lever` message, not the repo; the account is removed after the event.
- Which run log is on stage after 13:05: the seed-16 night, or a final shift's log?

Decided since Saturday: the product name on this branch (Fettero); a separate jury account; the demo
night (the final agent's seed-16 night instead of Saturday's seed 5); Oversikt's red alert band is
gone, replaced by the bell and the handover page.
