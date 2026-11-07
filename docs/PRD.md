# PRD.md — Product requirements

> **Draft for team review (Hamad, ShirazIQ), written from what is built on Sat 7 Nov night.** It
> describes the product as it stands on `hamad/lobby-v2` (app, with `main`'s receptionist merged in)
> and `hamad/final` (agent), not a wish list. Changes only by team agreement (AI_RULES R2); an AI that
> wants to add something not listed here stops and asks. Lines marked **[decide]** need the team.

## 1. One-line description

**Lobby** helps **the hotel's 06:00 handover manager** **see what needs a person now and act on it in
a minute** by **putting the whole hotel and the night robot's run log on one screen: rooms, guests,
requests, work orders, stock, staff, shortest routes and the robot's night.**

## 2. Who it's for

**Primary user: the night manager or front-office lead who hands the hotel over to the day shift at
06:00**, at a desk or on an iPad, in a 40–150 room hotel **[decide: size band is our assumption]**. Often
new in the job, sometimes working in a second language. Needs to know which rooms can be sold, which
guest is still waiting, what broke overnight, and who does what next.

Secondary users the app serves (shown only in Q&A, not in the 2-minute demo):

- **Resepsjonist**: the receptionist's calls, booking requests and messages (role `receptionist`).
- **Robotansvarlig**: the person who looks after the robot: 3D-kart, Natteskift, Øyne, Stemme (role `robot`).

## 3. The problem and why now

**The pain, as we read it (not yet confirmed by a hotel: see § 8):** at 06:00 the night's events are
spread over the robot, the phone, staff notes and the stock room. Rooms that are clean but not
released can't be sold for early check-in, a guest whose request failed is still waiting, and faults
surface late.

**Evidence we can cite** (links in `docs/DEMO.md` § 1):

- Staff churn: even in a normal year, under 11 % of the people who had worked in Norwegian
  accommodation and food service every month from Nov 2018 to Feb 2019 had left the industry by June
  2019; about 40 % of the stable workforce is part-time (SSB analyse 2023/9). The handover reader is
  often new.
- Guests in many languages: 26.7 million hotel guest nights in Norway in 2024, a record; foreign hotel
  nights up 14 % (SSB, 4 Feb 2025).
- Linen: hotels can lose or discard 15–20 % of linen before the end of its useful life (TRSA research,
  cited by Hotel Management Network, Aug 2026), though no reliable global benchmark exists.

**Why now:** a language-model agent can run a robot's night without per-hotel scripting and handle
requests it has never seen, if the safety rules sit in code around it; our agent did that on Wybe's
live simulation (best night 2,695 points, every "done" credited). The same models read a product pack
without a barcode and hold a phone call in the guest's language.

## 4. The demo story

Same as `docs/DEMO.md` § 2 (2:00, one user, one story):

1. **Oversikt** (0:00–0:40): the night manager at 06:00 sees the Nå band (what needs a person now,
   loudest first, one action per row) and eight figures.
2. **Lag renholdsrute → Ruter** (0:40–1:00): the three rooms to clean become the shortest round
   across floors (194 m, about 7 minutes, lift with the cart). Holio pain 6.
3. **Forespørsler → Ta over** (1:00–1:20): a request the robot honestly couldn't finish (towels out of
   stock) is taken over by a person, with *Angre*.
4. **3D-kart → Natteskift** (1:20–1:50): the robot's real night replayed from its run log; 68 tasks
   done, 10 failed and reported as failed, 2,212 points on the night shown, 2,695 our best.
5. **Close** (1:50–2:00): back on Oversikt.

## 5. Scope (as built)

### Must (the demo breaks without it) — built

- **Login with roles** (admin, resepsjonist, robotansvarlig), enforced on the server
  (`src/proxy.ts`, `src/features/auth/`).
- **Oversikt**: top bar with the night and the robot chip, Nå band, eight figures, one widget per
  module (`src/features/dashboard/`).
- **Rom og renhold**: the key rack, every room's status from the robot's night, cleaners' rounds
  (`src/features/rooms/`).
- **Ruter**: shortest cleaning round and the robot's walk per task, on tonight's hotel map, using a
  TypeScript port of the agent's router with parity tests (`src/features/routes/hotelRouter.ts`).
- **Forespørsler** with *Ta over* / *Ta saken* and *Angre* (`src/features/requests/`).
- **3D-kart** (three.js replay of the night) and **Natteskift** (the night step by step, failures with
  reasons) (`src/features/hotel3d/`, `src/features/nightshift/`).
- **The run log** of a real live practice night (`public/runs/demo.jsonl`).
- **The Night Shift agent** (`agent/`): plays Wybe's simulation on its own, scored by Wybe's server.

### Should (makes the demo clearly better) — built

- **Vedlikehold**: work orders by priority, the robot's findings and staff reports; *Tildel*, *Marker
  løst* (statuses kept in the browser).
- **Gjester og bookinger**, **Lager og lin**, **Ansatte og vakter**: on test data, marked on screen.
- **Resepsjon**: the ElevenLabs AI receptionist (configured for 38 languages, quotes the direct
  price, haggles in fixed steps at most 10 % under it, records booking requests and messages for staff
  to confirm, never takes card numbers) and its call log.
- **Robotens øyne**: live camera boxes on the device, products identified by Claude without a barcode,
  *Vis vei* to the product's shelf. Holio pain 3.

### Could (only once every must and should is stable) — partly built

- **Snakk gjennom roboten**: staff speak their language (eleven), the robot answers aloud; proposed
  robot tasks need *Bekreft*. Built, but **not connected on the deployed app** (no agent id set), and
  guest-to-staff translation is not built. Holio pain 9 at demo level only.
- **Live mode (*Direkte*)**: follows a running shift through the agent's local viewer; local only.
- **Plukkliste** in Ruter: works on a hand-made stub map (`TODO(phase-2)`).

## 6. Out of scope — cut, with the reason

- **PMS, inventory, staff-planning and maintenance integrations.** Test data stands in, marked
  `TODO(phase-3)` in code and with a `SourceNote` on screen. Integration is pilot work, not demo work.
- **A database or shared backend.** Statuses and receptionist records live in the browser
  (`localStorage`); one desk doesn't see another's ticks. Fine for one presenter.
- **Payments.** The receptionist records requests; staff confirm and take payment. No card data, ever.
- **Real robot hardware.** The robot is Wybe's simulation; on hardware only the API adapter changes,
  and that claim is untested.
- **Linen counting by camera** (Drift spec "should"): cut for time; Lager og lin shows test stock.
- **Voice complaint → work order** (`create_work_order`, Drift spec "must"): cut; voice proposes
  robot tasks only.
- **Translation between guest and staff** in Stemme: the next step, not built.
- **A separate Drift screen**: folded into Oversikt.
- **Self-service sign-up, password reset, user admin**: four accounts from an env var.
- **Multi-hotel, native mobile apps, email/SMS notifications, a live phone number** (the webhook route
  exists; the deployed app has no secret set, so calls stay in the browser).
- **Face recognition or guest identification**: never, by design.
- **Editing the agent from the app.** The app reads the run log; it never steers the robot.

## 7. Success criteria

- The demo story (§ 4) runs end to end on the deployed URL, three times in a row, from a laptop that
  isn't the builder's, inside 2:00.
- **Functionality:** every beat is live; nothing on screen is a screenshot. Data sources are labelled.
- **A real problem:** the hook uses only sourced figures (`docs/DEMO.md` § 1); no unsourced claim.
- **Innovation:** the agent's numbers are real and checkable in its run logs (best 2,695; every "done"
  credited; one penalty on the best night).
- **Design:** a juror understands Oversikt without narration (to test: a hallway test Sunday morning,
  5 people, time to the first right action) **[decide: run it or not]**.
- **Team efficiency:** the cut list (§ 6) is said aloud when asked; the gate (`./scripts/check.sh`) is
  green on `main` at 14:00 (today: 759 app tests and 743 agent tests passing).
- **Wybe:** all 10 final shifts started at 12:00, none scored 0 for not starting.

## 8. Open questions

- **[decide]** Buyer, price and pilot for the final's business slide (proposal in `docs/DEMO.md` § 3).
- Have we any hotel person to quote? None so far; can anyone at the venue be asked Sunday morning?
- Hallway test Sunday morning: who runs it, and do we quote the result?
- Connect Stemme's ElevenLabs agent on the deployed app, or leave Stemme out of every demo?
- Does Holio count three pains in one product for or against us? (CONTEXT § 6, still open.)
- Repo public, or jury access by invitation, before 14:00? (CONTEXT § 11.)
- Is the demo login (`README.md`) acceptable in a public repo, or do we add a separate jury account and
  rotate the password after the event?
- Which run log is on stage: the recorded seed-5 night, or a final shift's log after 13:05?
