# PRD.md — Product requirements

> **Draft for team review (Hamad, ShirazIQ), updated Sun 8 Nov morning from what is built on
> `hamad/jury-loop` (app) and `hamad/final` (agent).** It describes the product as it stands, not a
> wish list. Changes only by team agreement (AI_RULES R2); an AI that wants to add something not listed
> here stops and asks. The team's open decisions were settled on Sun 8 Nov morning (after the fourth review round):
> the wedge, its reason, the commitment and the stop rule (§ 8). The product trades as **Fettero** on this
> branch (the team lead decides whether `main` follows); code identifiers keep the old `lobby` names.

## 1. One-line description

**Fettero** helps **the hotel's 06:00 handover manager** **take over the night in a minute, get the
rooms that are free to reception hours earlier and hand on what is still open** by **turning the night
clerk's entries, one signal per room from the door lock, the booking system (read-only), the AI
receptionist's calls and, where there is one, the night robot's run log into one signed handover page,
where nothing says "confirmed" without a signal from outside the robot.** The one line: *Natten, ærlig
overlevert.*

## 2. Who it's for

**Primary user: the night manager or front-office lead who takes over the hotel at 06:00**, at a desk
or on an iPad, in an independent or chain hotel of 60–200 rooms: the typical Norwegian hotel, which has
about 86 rooms (92,678 rooms in 1,079 hotels, SSB table 14164, Sep 2026). Software first; the robot is
optional. Often new in the job, sometimes working in a second language. Needs to know which rooms can be sold, which guest is
still waiting, what broke or went wrong overnight, and who does what next.

**Buyer (signs the contract): the hotel's general or operations manager** of an independent or chain
hotel in that band. The buyer reads money and care: rooms ready before the housekeeping round (worth a
room-night only when the night sells out), and a record that every hazard had an owner. The user reads
"nothing is lost at 06:00". Price, channel and the first 100 users: `docs/DEMO.md` § 7. The data
processing agreement a pilot hotel signs: `docs/DPA.md`.

Secondary users the app serves (shown only in Q&A, not in the 2-minute demo):

- **Resepsjonist**: the receptionist's calls, booking requests and messages (role `receptionist`).
- **Robotansvarlig**: the person who looks after the robot: 3D-kart, Natteskift, Øyne, Stemme (role `robot`).
- **Short-let host or property manager** (role `host`, `/vert`): the same engine for 4 flats in Oslo,
  on test data. Built to test that the product generalises; it has its own login, is not in the hotel
  admin's menu and is not on the business slide (one wedge).

## 3. The problem and why now

**The pain, as we read it (not yet confirmed by a hotel: see § 8 and `docs/DEMO.md` § 8):** at 06:00
the night's events are spread over the robot, the phone, staff notes and the PMS. Rooms that are empty
but still marked occupied ("sleepers": a guest due out yesterday whose check-out was never recorded)
wait until housekeeping's round finds them, usually by late morning; a room due out today is not one,
since the PMS already sells it. So what Fettero buys is hours, which are money on a night that sells
out and for an early check-in. A guest whose request failed is still waiting; safety events and faults
surface late.

**Evidence we can cite** (links in `docs/DEMO.md` § 1):

- Staff churn: even in a normal year, under 11 % of the people who had worked in Norwegian
  accommodation and food service every month from Nov 2018 to Feb 2019 had left the industry by June
  2019; about 40 % of the stable workforce is part-time (SSB analyse 2023/9). The handover reader is
  often new.
- Every room counts: Norwegian hotels sold 18.5 million room-nights in 2025 at an average NOK 1,471 a
  room, 57 % of rooms sold; in Oslo NOK 1,631 and 72 % (SSB statbank table 14169). Hotelloversikten's
  sample gives NOK 1,444 and 62.5 % for the same year.
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
request type (found by probing an undocumented API), safety rules in code, and Claude only as a guarded
fallback (about USD 0.001 spent all weekend). For deliveries it reports "done" only after it has seen
the server's score rise, so those are credited by construction; room checks and spill reports rest on
its own judgement. Numbers per build, pinned to commits on `hamad/final`, not a best night: the branch
head at 03:30 (`c3801e0`) averaged 2,591 on its four tuned seeds (best 2,760, seed 10; `8eac151` before
it, 2,560). The build that plays at 12:00 is `8de9ffc` (the head of `hamad/final`, on `main` since 05:59). Our forecast for the final's unseen seeds, from a build-plus-seed model fitted on every complete live build night (`scripts/forecast.py`, `docs/runs/forecast.txt`), is **a median of 2,050, 80 % between 1,759 and 2,393**: lower than the tuned nights mostly because those seeds are easier (about −19 %), plus a measured tuning penalty of about −5 % (from two nights). Out of sample: the forecast committed at 04:08 (median 2,035, 80 % 1,898–2,186) held, because the dress rehearsal on ten never-played seeds came in at 2,176 (best 9 of 10). A second forecast from the rehearsal alone, committed at 06:44 before the final: median 2,170, 80 % 2,055–2,301. Over the 18 live nights of the last four builds the referee credited 1,263 of
1,267 "done" reports (99.7 %); taking out the ones sent after the score rose, **185 of 189 claims on its
own judgement were credited (97.9 %), room checks 117 of 117**; those 189 are 65 distinct claims
(seed, request) replayed across near-identical builds, so the honest count is **64 of 65 (95 %
interval 92–99.7 %)** credited by the simulator, and **54 of 65 (72–90 %) holding against the robot's
own log** (the card's 209 rule run over every night by `scripts/ledger.py`: the simulator's room check
doesn't see what the robot delivered; on the dress rehearsal's never-played seeds, 88 of 101 hold). With the score hidden from its decisions (four live nights on a side branch,
Sun 04:26), it made the same 291 decisions and the referee credited 290; its own check never said "not
done" on those nights (0 of 265), so that shows the score wasn't needed there, not how well the robot
catches a failure. Best practice score anywhere: 2,807, **#8 of 20** on Wybe's board at 04:10 Sun, from a board test (a seed-specific test branch, `kind=board-test` in the ledger, kept out of every build figure), not the final build; the final branch's best is 2,760. On the night in the app (seed
16, 2,680, `cb72845`) it reported "done" 73 times: 64 after the score rose and 9 on its own judgement,
all 9 credited by the referee (95 % interval 70–100 %); but one of them, 209 reported empty and tidy at
03:47 after the robot itself carried bags in at 01:29, is contradicted by its own log, so the card says
**8 of 9 hold against its own log**. Full table and the replay bed's limits: `docs/DEMO.md` § 1.1.

## 4. The demo story

Same as `docs/DEMO.md` § 2 (2:00, one user, one story, one page: Siri takes over from Kjersti and the
robot, on Overlevering 06:00, where she lands after login; every move is a tap):

1. **The top** (0:00–0:20): 209 held back because the robot's own log contradicts its report (bags in at
   01:29, "empty" at 03:47), and four safety items, each with an owner, *straks*.
2. ***Uten robot*** (0:20–0:29): hotel number one has no robot; the same page from the booking system,
   one signal per room from the door lock (never who) and the night clerk's entries.
3. **The money, without a robot** (0:29–0:58): the money figure lands on 213: due out yesterday, the
   check-out never recorded; the lock shows no guest card since 18:00 and Kjersti saw it empty at 04:24, two
   sources and no robot; found five hours before housekeeping, about 1,500 kroner if the night sells
   out. Reception confirms (who, folio, bags, key card), the room goes to reception, and the row waits
   for the booking system: the button never says sold.
4. **The robot's card** (0:58–1:25): back to *Med robot*, the robot figure lands on the card (*8 av 9*
   against its own log, *7* refusals of a stranger, *10 av 15* entries without a knock) beside the night
   clerk's *«Rolig natt.»*; the referee and the cross-night figures sit behind *Slik vet vi det*.
5. **Kvitter mottatt** (1:25–1:35), last on the page: *Kvittert av Siri Haugen*, saved on this device.

## 5. Scope (as built)

### Must (the demo breaks without it) — built

- **Login with roles** (admin, resepsjonist, robotansvarlig, host), enforced on the server
  (`src/proxy.ts`, `src/features/auth/`), plus a separate `jury` account for the event.
- **Overlevering 06:00**, where the pilot accounts land after login, read as *act → evidence → sign*:
  one quiet demo band says what is test data; four figures, each a link to its row (209 held back, the
  money: *Funnet ledig 5 timer tidligere · ca. 1 500 kr hvis natten blir utsolgt · 31 av 36 booket i
  kveld* with *Slik regner vi*, safety *straks*, the robot's tasks); *Åpent nå* in the wide column,
  safety first with *straks* and who was told (or *varsle nå*), then everything by deadline, each with
  an owner by role (Vaktmester, Resepsjon, Renhold, Nattevakt): the robot itself at 06:00 (not docked,
  20 %, still holding the master keycard and the cart, *før 06:15*), 213 with its two steps inline, 209
  led by the robot's own contradiction, the rooms with bags for several arrivals; *Dette skjedde i
  natt* beside it on a wide screen (below it, folded, at 125 %); the judgement card as three figures
  (*8 av 9* against its own log, *7* refusals of a stranger, *10 av 15* keycard entries without a
  knock); *Kvitter mottatt* last (*Kvittert av …*, saved on this device); the proof behind *Slik vet vi
  det*; a print view. The switch ***Natten fra: Med robot | Uten robot*** builds the same page from the
  booking system, the door lock's one signal per room and the night clerk's entries only, with no robot
  line (`src/features/handover/`, `src/features/nightsource/`).
- **The money step obeys the product's rule:** step 1 records *which* receptionist confirmed (default
  the night receptionist) and three checks (folio settled, no bags in the room, key card blocked), and
  opens only with all three; step 2 is *Send til resepsjonen*, after which the row reads *Venter på
  PMS-en*, never "sold" or "done", because the pilot is read-only and reception makes the change in the
  PMS (`src/features/rooms/SellSteps.tsx`).
- **Nattevaktens logg** (`/natt`, in the pilot menu after Overlevering): the night clerk logs a room in
  two taps (*Tom og ryddig*, *Ikke tom*, *Trenger vask*), a safety item with its place (*Vått gulv*,
  *Dør*, *Person*) or a short note; each entry is the same run-log line the robot writes, with source
  `staff`, her name and the time; *Angre* appends a correction; a wet floor asks *Skilt satt ut? Ja /
  Nei* (required, so the record says whether a sign went out); kept on the device for 30 days
  (`RETENTION_DAYS`, pruned on load; `TODO(phase-3)`: a server store). *Fra roboten* lists the robot's
  hazards at its clock, each with a *Kvitter* that records who saw it and when. The door lock's
  per-room signal is a team-written sample in the same format, with no clock (a card in the slot is a
  yes; "no card" means since 18:00), and *Sjekk disse først* lists where it and the booking system
  disagree; the lock line and the guest's name show only on those rooms, an unflagged booked room
  reads *booket* (`src/features/staffinput/`, `src/features/doorlock/`). The hotel-one product, without
  a robot.
- **Rom og renhold** with **Robotens romsjekk mot bookingsystemet**: the robot's room checks
  reconciled with the (test) PMS; a room must be empty after 01:00 before it is suggested, a later
  delivery into it, or the robot's own log contradicting its report, holds it back, and a room goes to
  reception in the same two steps as on Overlevering (`src/features/rooms/`).
- **Forespørsler**: everything guests asked for, from the robot, the AI receptionist (a call becomes a
  task), staff and voice. What the robot handed back is pinned first; phone calls are their own group
  below, and a call for a room the hotel doesn't have shows *Ukjent rom* for reception, never a room
  task. *Ta saken* and *Angre*, stamped with who and how long ago (*Siri Haugen tok saken · nå*). Each
  of the robot's declines is a decision for a person (*Gi det likevel?*), with whether the referee
  credited it (`src/features/requests/`).
- **One selector for the night**: every screen reads task totals and occupancy from the same run log
  and the same test data, so the numbers agree across screens.
- **3D-kart** (three.js replay of the night) and **Natteskift** (the night step by step, outcomes with
  reasons, *Godkjent av dommeren* (the Wybe Night Shift simulator's referee), and the card *Robotens
  vurderinger i natt*: refusals of a stranger grouped as one incident, credited "done" with the
  cross-night precision from `docs/runs/ledger.csv`, declines split by whether the referee credited
  them, wet-floor signs, Do-Not-Disturb doors) (`src/features/hotel3d/`, `src/features/nightshift/`).
- **The run log** of a real live practice night of the final agent (`public/runs/demo.jsonl`, seed 16).
- **The Night Shift agent** (`agent/` on `hamad/final`, and on `main` since 05:59 Sun: PR #25, merge
  `93f71d4`, `8de9ffc`'s agent): plays Wybe's simulation on its own, scored by Wybe's server.

### Should (makes the demo clearly better) — built

- **Oversikt**, one tap from Overlevering: a greeting by the shift clock of the night shown, one
  factual line that says what "done" rested on (*73 oppgaver ferdig (64 bekreftet av simulatoren, 9 på
  robotens egen vurdering: 8 holder mot egen logg)*), *Se overleveringen 06:00* as the one primary
  action, the pilot's figures only, with *Rom klare til salg* naming its rooms (*Klar nå: rom 314 ·
  etter bekreftelse: rom 213 · holdt tilbake: rom 209*), and for the pilot accounts only the pilot's
  widgets (`src/features/dashboard/`). *Timer spart* and *Gjester fornøyd* are gone (round 4), and so
  are the widgets for modules outside the pilot (round 5).
- **The menu is the pilot** for the admin, `siri` and `jury`: Overlevering as the landing page, then
  *Piloten* (Overlevering 06:00, Nattevaktens logg, Rom og renhold, Forespørsler, Natteskift); the other hotel
  screens sit under one folded *Utenfor piloten* ("Bygget, men ikke med i piloten."), reachable but out
  of the way (`src/features/modules/registry.ts`, `PILOT_MODULES`). The desk, the robot manager and the
  host keep their own menus; access is unchanged.
- **The bell** (*Varsler*): only what needs a person, safety first: each unsigned wet floor (since when,
  owner) and the stranger at seven doors (in the handover's neutral words, *Resepsjon, straks*) as
  *Haster*, computed by Fettero from the run log; red and amber appear only for what is urgent.
- **Ruter**: shortest cleaning round and the robot's walk per task across floors, by lift with a cart,
  using a TypeScript port of the agent's router with parity tests (`src/features/routes/hotelRouter.ts`).
  The headline compares metres only, against a named baseline the optimiser also respects, and says
  *like kort* when it is (today's cleaning round is as short as room-number order).
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
- **Plukkliste** in Ruter: a seeded order on a 4-shelf test warehouse map (`TODO(phase-2)`), compared
  with a list sorted by shelf (16 m, 10 %) and with the list as written (32 %); the four work guides as
  cards in Norsk, Polski, Українська and English; an unsure camera match waits for the SKU from the
  label before it goes on the list.
- **Send roboten** from Forespørsler: puts the task in the robot's queue in this browser only, and says
  so (*sendes når roboten er koblet til*, `TODO(phase-3)`); nothing reaches a robot yet.

## 6. Out of scope — cut, with the reason

- **Writing to the PMS. Decided Sun 8 Nov (round 5): the pilot is read-only.** Fettero never changes
  a booking and never sells a room: the step after the desk confirms is *Send til resepsjonen*, and
  reception makes the change in its own system; the row then waits for the PMS (*Venter på PMS-en*)
  and would turn green only when the booking system shows the room free (the connector that reads the
  check-out back is `TODO(phase-3)`, so in the demo the row stays waiting). The PMS stays the truth.
- **PMS, inventory, staff-planning and maintenance integrations.** Test data stands in, marked
  `TODO(phase-3)` in code and with a `SourceNote` on screen. The PMS test data was written after we saw
  the robot's log, to show what the join does; in a pilot it reads the hotel's PMS. Integration is pilot
  work, not demo work. **The first hurdle may be a contract, not the GDPR** (legal review): a lock
  vendor's licence may forbid exporting audit data to a third party or charge for its API, and a PMS
  vendor's read-only API (Mews, Apaleo, Visma) needs a marketplace or partner agreement and that
  vendor's DPA chain. No vendor has been asked yet. No lock system is connected either: the door-lock and energy-slot signal in the
  demo is a team-written sample, and many hotels run offline locks with no signal at night, where the
  night clerk's room check is the evidence (`docs/PRIVACY.md` § 10).
- **A database or shared backend.** Statuses, sign-offs and receptionist records live in the browser
  (`localStorage`); one desk doesn't see another's ticks, and *Kvitter mottatt* is not an audit record
  yet. A pilot writes these as append-only events beside the robot's.
- **Payments.** The receptionist records requests; staff confirm and take payment. No card data, ever.
- **Real robot hardware, and the sim-to-real gaps** we name rather than hide:
  - For deliveries, *done* is gated by Wybe's score rising; a hotel has no score. So the card splits
    them: on the demo night 64 "done" came after the score rose and 9 on the robot's own judgement (9
    of 9 credited, 8 of 9 holding against its own log); over the final branch's 18 nights, 64 of 65
    distinct own-judgement claims credited (95 % interval 92–99.7 %), 54 of 65 holding against its own
    log (72–90 %). A pilot needs a
    second signal instead, and **at least one from outside the robot** (the lock's guest-card entry,
    the guest's acknowledgement or PIN, the clerk's check, the PMS); two signals from the robot alone
    (its own lock credential and its own photo) read *robotens egen observasjon*, one signal *ikke
    bekreftet* (`src/features/nightshift/conduct.ts`). **With the score hidden** (side branch
    `hamad/blind`, four live nights at 04:26 Sun on seeds 10, 16, 23 and 5), the agent decided "done"
    only from what it saw (the place reply, the guest's answer, the sign over the spill): the same 291
    decisions as the sighted build, 290 credited; its own check never said "not done" (0 of 265), so
    the run shows the score wasn't needed on those nights, not how well the robot catches a failure.
    That was measured offline with failures injected (`hamad/faults`, 640 nights, 13 kinds of fault):
    the check caught 79 % of the injected failures at a 5 % failure rate (81 % at 30 %; 88 % without
    the sleeping-guest type, which it never catches), with precision 98.5 % at 5 %; the fault wordings
    are ours, so it measures kinds of failure, not their frequency (`docs/DEMO.md` § 1.1).
  - **The simulator's room check is a text oracle, and 209 shows its limit:** at 01:29 the robot placed
    luggage-209 inside room 209; at 03:47 its look said "Nobody is here. The room is tidy." and the
    referee credited the report. A real occupancy check has false negatives (a guest under the duvet,
    someone in the bathroom), so in a hotel the order is the lock trail, the energy slot and the PMS,
    with the camera last, and a person confirms before anything is sold.
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
    battery reserve and never takes a sign off a wet floor. What the hotel's rules cost in the sim,
    measured in the replay bed on 164 real nights (`hamad/hotelrules`): −125.8 points a night for all
    four, almost all of it (−105.2) from never moving a sign with only three in store; the knock costs
    −12.4. A sign stock per floor makes the safe rule nearly free. Live on Wybe's server (hotel-rules
    mode, `NS_HOTEL_RULES=1` on `70d5be4`, about 05:55 Sun, seeds 10/16/23/5): 2,605 / 2,584 / 2,393 /
    2,453 against the final build's 2,760 / 2,748 / 2,298 / 2,559, mean 2,509 against 2,591: −82 points
    a night, with a knock before 59 of 59 keycard entries (the final build: 26 of 61 on the same seeds).
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
  § 8.2: three people, time to the first right tap), run by ShirazIQ (team to confirm).
- **Team efficiency:** the cut list (§ 6) is said aloud when asked; the gate (`./scripts/check.sh`) is
  green on `main` at 14:00.
- **Wybe:** all 10 final shifts started at 12:00, none scored 0 for not starting.

## 8. Open questions

- **Decided Sun 8 Nov (round 4):** one wedge, independent and chain hotels of 60–200 rooms, software
  first, the robot optional. The reason: the 06:00 handover exists in every hotel tonight, robot or not,
  so a pilot needs no hardware, and the band is the typical Norwegian hotel (about 86 rooms on average,
  SSB 14164). Price NOK 30 per room per month; first channel direct, from the phone round. The
  commitment and the stop rule: both of us full-time for four weeks from Monday 9 Nov; if fewer than 2
  of 10 hotels take a free pilot by 8 December, we stop the hotel wedge and test selling through robot
  makers. The ceiling: Norway's 92,678 hotel rooms ≈ NOK 33 M a year at full share; the four big Nordic
  countries ≈ 359,000 rooms ≈ NOK 129 M (Eurostat); the next price lever is a robot connector per
  robot per month (`docs/DEMO.md` § 7).
- **Proposed Sun 8 Nov after the fifth review round (team to confirm; `docs/DEMO.md` § 7):** the pilot
  converts **on usage**, the handover signed in Fettero on 5 of 7 mornings in 3 of the 4 weeks plus the
  general manager's yes, with rooms found before the housekeeping round reported beside it, not as the
  gate. Measuring it needs the sign-off as an append-only server event (hotel, role, date; no guest
  data), `TODO(phase-3)`, the first week's build task. Hotel 1 goes live on 16 November, before the
  julebord peak, and the stop rule counts the first 10 hotels we actually spoke to, not the calendar,
  because 8 December falls inside the season. The named security step before hotel 1: one account per
  person with its own password, and sessions revocable one by one (`docs/checks/threat-model.md`).
- Have we any hotel person to quote? None so far. The phone round and hallway test (`docs/DEMO.md`
  § 8) are planned for Sunday morning, run by ShirazIQ while Hamad is at the Wybe final (team to
  confirm). The night desks are reachable before 06:45, the buyers 08:00–09:30 (§ 8.1).
- Does `main` trade as Fettero too? (Team lead.) The public URL, lobby-sandy.vercel.app, serves `main`
  under the old name and an older CSP; `hamad/jury-loop` isn't deployed (team lead's rule).
- The name isn't cleared. A quick web check on Sun 8 Nov found FETTERO registered in the US for
  jewellery (class 14, no conflict with software) and FETUERO registered in the US in class 9
  (software), close enough to need a proper search: Patentstyret, EUIPO TMview and WIPO in classes 9,
  42 and 43, and whether FERRERO's reputation reaches a sound-alike (`docs/PRIVACY.md` § 9).
  `fettero.no` is free at Norid; `fettero.com` is taken (registered 2020). Until the search is done we
  don't say "clear".
- Does Holio count three pains in one product for or against us? (CONTEXT § 6, still open; ask at the
  Holio stand before 14:00.)
- Repo public, or jury access by invitation, before 14:00? (CONTEXT § 11.) The jury account's password
  goes in the `/lever` message, not the repo; the account is removed after the event.
- Which run log is on stage after 13:05: the seed-16 night, or a final shift's log?

Decided since Saturday: the product name on this branch (Fettero); a separate jury account; the demo
night (the final agent's seed-16 night instead of Saturday's seed 5); Oversikt's red alert band is
gone, replaced by the bell and the handover page.
