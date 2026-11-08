# PRIVACY.md — Personal data, processors and security in Fettero

> For the jury's lawyer and security reviewer, and for us. Short and honest: what the hackathon build
> does today, checked in the code on Sun 8 Nov at about 03:00 (`hamad/jury-loop`; the product trades as
> Fettero there, while code identifiers keep the old `lobby` names), and what a real hotel deployment
> would still need. The transfer basis per processor (§ 3.1) was checked against primary sources (the
> DPF list, each vendor's DPA) at about 04:00 the same morning. The pilot's own data sources (the
> door-lock signal, the energy slot and the night clerk's entries, § 10) and the EEA status of the EU
> acts (§ 7) were read against primary sources at about 05:30 (Lovdata, EUR-Lex, EFTA's EEA-Lex,
> Datatilsynet). Room 210's purpose (§ 10.2), the staff-investigation line (§ 10.3), the limitation
> periods and Vercel's default region (§ 3, § 7) were added at about 07:45 against Lovdata and Vercel's
> documentation. A data processing agreement a hotel can sign is in [`docs/DPA.md`](./DPA.md). Not legal
> advice; a pilot needs a lawyer's review. The full threat model for login and roles is in
> [`docs/checks/threat-model.md`](./checks/threat-model.md).

## 1. In one paragraph

The demo touches **no real guest or employee data**. Guests, staff, stock and work orders are made-up
test data, marked on every screen ("Testdata til integrasjonen er på plass."). The robot's night comes
from Wybe's hotel simulation, whose guests are fictional. The only real people in the system are the
team: the login accounts, and our own test calls to the AI receptionist. The app shows **only calls
after a cut-off** (`RECEPTION_CALLS_SINCE`, set on the demo laptop to Sun 8 Nov 05:30), so our 7 Nov
test calls never reach a screen, and the team also deletes them in ElevenLabs before 14:00. There is
**no database**.
Camera frames and voice go to two AI processors, **Anthropic (Claude API)** and **ElevenLabs**, both
outside the EEA. Nothing identifies people: there is no face recognition anywhere in the code. The
pilot (software only) uses neither: it reads the booking system, **one signal per room from the door
lock and the energy slot, no card id, no clock**, and the night clerk's own entries (§ 10).

## 2. What personal data the demo touches

| Data | Real? | Where it comes from |
|---|---|---|
| Guest names, rooms, arrivals, special needs | No: invented test data | `src/features/guests/testData.ts` (`TODO(phase-3)`: PMS integration) |
| Staff names and shifts | No: invented | `src/features/staff/testData.ts` |
| The night clerk's entries (rooms checked, hazards, notes, her name) | No: a sample night (Kjersti Lund, invented), labelled; anything typed on `/natt` stays on that device | `src/features/staffinput/` (§ 10.3) |
| The door lock's per-room signal | No: a team-written sample, labelled; one signal per room, no card id, no clock | `src/features/doorlock/feed.ts` (§ 10.1) |
| Who at reception confirmed a room, and what they checked | Invented names (the default is the night receptionist on Ansatte) | `src/features/rooms/SellSteps.tsx`, stored on the device |
| Guest names in the robot's night ("Dr Silva", "Ms Rossi") | No: Wybe's simulation | `public/runs/demo.jsonl` (live practice night of the final agent, seed 16) |
| The host view's flats, guests and messages | No: invented | `src/features/host/demoData.ts` |
| Login accounts (`hamad`, `shiraz`, `resepsjon`, `robot`, `vert`; `siri`, a demo persona with the team's password; and `jury` for the event) | Team only; the jury account has its own password and is deleted after the event | `LOBBY_USERS` env var, scrypt hashes, never passwords (`scripts/lobby-hash.mjs`) |
| Receptionist calls: caller name, call-back number, dates, a summary | The team's own test calls (7 Nov), hidden by the cut-off and deleted before the demo; anyone who calls on stage | Held by ElevenLabs; read back on demand, only calls after `RECEPTION_CALLS_SINCE` (§ 4); phone numbers masked on every screen |
| Camera frames | Whatever the phone sees | Øyne (§ 5) |
| Voices | Whoever speaks to Stemme or Resepsjon | Streamed to ElevenLabs (§ 6) |

## 3. Processors (who receives what)

| Processor | Receives | From | Location |
|---|---|---|---|
| **Anthropic (Claude API)** | Product crops and some whole camera frames (Øyne); request text from the simulation when the agent's parser can't read it (rare: the agent's whole Claude spend this weekend is about USD 0.001, `temp/spend.json`) | `src/features/eyes/identify.ts`, `src/features/eyes/scene.ts`, `agent/brain.py` | US company; outside the EEA |
| **ElevenLabs** | Voice audio, transcripts, post-call fields (`caller_name`, `callback_number`, dates, room type, guests, summary); uses Claude as the LLM inside its agents (billed by ElevenLabs, so Anthropic is a sub-processor there) | `src/features/voice/agentConfig.ts`, `src/features/reception/agentConfig.ts` | Outside the EEA |
| **Vercel** | Hosting: every request passes through it | the deployment | US company; no function region is set in the repo (no `vercel.json`), so functions run in Vercel's default, `iad1`, Washington, D.C. ([Vercel docs, *Regions*](https://vercel.com/docs/regions), "Compute defaults"); an EU region such as `arn1` (Stockholm) is a **team check** before a pilot (§ 7) |

### 3.1 Transfer basis per processor (checked Sun 8 Nov, about 04:00)

Norway is in the EEA, so the GDPR's transfer rules apply as Norwegian law (personopplysningsloven), and
the EU's adequacy decision for the EU-US Data Privacy Framework (DPF, Commission decision C(2023) 4745
of 10 July 2023) covers transfers from Norway to a US company **on the DPF list**
([Datatilsynet, "Nye regler for overføring av personopplysninger til USA", 2023](https://www.datatilsynet.no/aktuelt/aktuelle-nyheter-2023/nye-regler-for-overforing-av-personopplysninger-til-usa/)).
The list was queried for each name through the search behind
[dataprivacyframework.gov/list](https://www.dataprivacyframework.gov/list).

| Processor | DPF list | Its DPA | What we rely on | Retention at the processor |
|---|---|---|---|---|
| **Anthropic** (Claude API) | **Not on the list**: no active or inactive entry for "Anthropic" | [DPA](https://www.anthropic.com/legal/data-processing-addendum), effective 24 Feb 2025, part of the Commercial Terms: it incorporates the **standard contractual clauses** (Commission decision 2021/914), Module Two (controller to processor) and Module Three (processor to processor), under Irish law, with UK and Swiss addenda (DPA § I, Schedule 3); Anthropic will help with a transfer impact assessment (§ I.4) | **The SCCs in its DPA.** A transfer impact assessment is ours to write before a pilot (not done) | API inputs and outputs are deleted within 30 days, unless held to enforce the usage policy, by law, or under a zero-retention agreement ([Anthropic Privacy Center](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), 1 Jul 2026) |
| **ElevenLabs** | **Active**: Eleven Labs Inc. (New York), EU-US DPF plus the Swiss and UK extensions, self-assessed; current period 9 Feb 2026 to 9 Feb 2027 ([its DPF policy](https://elevenlabs.io/eu-us-data-privacy-framework-policy)) | [DPA](https://elevenlabs.io/dpa), last updated 8 Apr 2026, § 11.1: transfers on an adequacy decision including the DPF, or on the EEA SCCs (2021/914), or other safeguards | **The DPF**, with the SCCs in its DPA as the fallback if the DPF falls | Receptionist: no audio, transcripts 30 days, set in our agent config (`privacy` in `src/features/reception/agentConfig.ts`). That the live agent carries it is **to check (team)**, § 4. On a self-serve account the DPA lets ElevenLabs delete content after 180 days of inactivity but doesn't oblige it to (§ 9.2.2). EU data residency is an Enterprise feature ([docs](https://elevenlabs.io/docs/overview/administration/data-residency)) |
| **Vercel** | **Active**: Vercel Inc., EU-US DPF plus Swiss and UK, listed since 20 Jun 2019, current to 29 Apr 2027 | [DPA](https://vercel.com/legal/dpa), effective 31 Mar 2026, with the 2021 SCCs as its transfer mechanism (Schedule 3). **It applies to Pro and Enterprise plans**: which plan the project is on is **to verify (team lead)** | **The DPF** (and the DPA's SCCs, if the plan carries the DPA) | Request logs as the plan sets them: **to verify** |

Two more to check before a pilot: whether Anthropic appears as a sub-processor on ElevenLabs' list
(ElevenLabs runs Claude inside our agents; **to verify**), and whether the DPF survives its court
challenges. The first one failed: the EU General Court dismissed the action for annulment of the DPF
adequacy decision (Implementing Decision (EU) 2023/1795) on 3 September 2025, *Latombe v Commission*,
T-553/23, ECLI:EU:T:2025:831 ([EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023TJ0553));
an appeal to the Court of Justice is reported (case number C-703/25 P, **to verify** on curia.europa.eu).
If the DPF fell, ElevenLabs and Vercel would move to the SCCs already in their DPAs, as Anthropic uses
today. For Øyne, Claude through an EU region of a cloud provider would remove the transfer question
altogether (§ 7, "An EU hosting path").

No analytics, no ad trackers, no third-party fonts at runtime (`next/font` self-hosts them), no CDN
for the camera model (served from our own origin, `src/features/eyes/useDetector.ts`). MediaPipe's
library has telemetry to Google built in (`odml.pa.googleapis.com`, found in the first legal
review). The app answers that one host on the phone before any request exists, so it never leaves the
device (`src/features/eyes/noTelemetry.ts`), and the Content-Security-Policy's `connect-src` (only our
own origin, the local 3D viewer and ElevenLabs) is the backstop (`next.config.ts`). **On this build
only:** the public URL (lobby-sandy.vercel.app) serves `main`, whose older header has no `connect-src`
(curl, Sun 02:50), so there the browser would let that call out.

## 4. What is stored where

| Store | What | Retention |
|---|---|---|
| **Session cookie** `lobby_session` | Username, role, view, expiry; HMAC-SHA256 signed, nothing secret inside (`src/features/auth/session.ts`) | 12 hours |
| **Run logs** (JSONL) | Every API call the agent made in the simulation, its decisions, the sim's fictional guests | Agent laptop `temp/runs/` (gitignored), kept for the event. One recorded night is committed (`public/runs/demo.jsonl`, seed 16) and served only behind login (`src/features/auth/roles.ts`, `SHARED_ROUTES`) |
| **The browser** (`localStorage`) | The receptionist's booking requests and messages until staff settle them (validated, newest 50: `src/features/reception/useStoredRecords.ts`), staff ticks, work-order statuses (`src/features/dashboard/useOrderStatuses.ts`), the room confirmations (which receptionist, the three checks, who recorded it and when) and rooms sent to reception, the handover sign-off with the user's name (the screen says *lagret på denne enheten*), the night clerk's log per handover day (`lobby:nattevakt-logg`, corrections appended, never deleted), and Øyne's avvik log per handover day (`lobby:oyne-avvik`) | **The night clerk's log: 30 days**, as code (`RETENTION_DAYS` in `src/features/staffinput/retention.ts`; days older than that are dropped on load and on every write, tested; `/natt` says *Lagres på denne enheten i 30 dager*); Øyne's avvik log: 30 days, dropped when read (`src/features/eyes/deviations.ts`); the room confirmations with the receptionist's name (`lobby:room-check-marks`, pruned to the same `RETENTION_DAYS` on load and on write, `src/features/rooms/reconcile.ts`), who was told about a safety item (`lobby:handover-varslet`, kept per hazard) and the sign-off (`lobby:handover-signoff`): 30 days, and since round 7 both are append-only: *Angre* on *Varsle* adds a correction line, *Angre kvitteringen* adds *Kvittering trukket tilbake av …*, neither deletes (`src/features/handover/told.ts`, `signoff.ts`). The receptionist's requests and messages until staff settle them (newest 50) or the browser data is cleared. On the staff device only; no server copy (`TODO(phase-3)`: a shared store with the same 30 days) |
| **ElevenLabs** | Receptionist conversations: transcript and post-call fields, **no audio** | 30 days, set in the agent config (`privacy`, `src/features/reception/agentConfig.ts`; Resepsjon says the same before the call). **To check (team):** open the receptionist agent in the ElevenLabs dashboard, confirm *record voice* off and retention 30 days, and write the time here. Until then we say "configured", never "checked". The live agent carries a changed config only after `src/features/reception/setup-agent.ts` is run again |
| **ElevenLabs** | Stemme (staff voice) conversations | No retention setting in `src/features/voice/agentConfig.ts`: the account default applies. Set it before any pilot |
| **Our server** | Nothing. No database, no file writes. Logs carry only error types or HTTP status, never bodies (`src/app/api/identify/route.ts`, `src/app/api/voice/token/route.ts`, `src/app/api/reception/tools/[tool]/route.ts`: "Arguments are never logged") | — |

Call notes shown in Resepsjon are read from ElevenLabs on demand (`src/app/api/reception/calls/route.ts`,
receptionist or admin only), cleaned of card numbers and control characters
(`src/features/reception/scrub.ts`), and not stored by us. Only calls that started after
`RECEPTION_CALLS_SINCE` are asked for, and checked again when they arrive; a malformed value fails
closed (503) rather than showing every call (`src/app/api/_lib/callsSince.ts`). Phone numbers are masked
on the server where the notes are mapped ("+47 ••• •• 493", `src/features/reception/maskPhone.ts`,
`callLog.ts`), so Oversikt, Forespørsler, the bell and Resepsjon never show a full number as text. The
full number still reaches a logged-in receptionist's or admin's browser in the call data, and becomes a
tap-to-call `tel:` link **only on a touch device**; on a laptop it stays masked text with no link, so a
hover on a projector shows nothing (`src/features/reception/PhoneLink.tsx`).

## 5. Camera frames (Robotens øyne)

- **On the device first.** MediaPipe's object detector (EfficientDet-Lite0) draws the boxes in the
  browser; that part sends nothing (`src/features/eyes/useDetector.ts`).
- **What is sent to Claude** (as a JPEG, through our server, `src/app/api/identify/route.ts` and
  `src/app/api/scene/route.ts`):
  1. **Automatically:** a crop (at most 768 px) of a box whose class is product-like (bottles, cups,
     food, a toothbrush …). **People are never cropped and sent**: `person`, furniture, vehicles and
     animals keep their free label only. **Guests' belongings are never sent either**, live or on a
     tap: phones, handbags, backpacks, suitcases, books, laptops, keyboards, remotes and the like
     (`BELONGING_CLASSES`): a phone at an ear or a bag on a shoulder would carry part of the person, and
     a luggage tag would be read out. **A box whose crop would touch a person** (a bottle in a hand) is
     never sent automatically; the hint says to tap instead (`src/features/eyes/cocoLabels.ts`,
     `autoIdentify.ts`, `cropFrame.ts` `touchesPerson`).
  2. **On a tap:** the crop of the tapped box, with every person the detector found painted over and
     only the product's own box drawn back, so a held item stays readable.
  3. **"Identifiser hele bildet":** the whole frame, at most 768 px (`src/features/eyes/EyesScreen.tsx`).
  4. **"Omgivelser" scan (off by default; a person must switch it on):** the whole frame, at most 640
     px, once every 10 seconds, to find doors, lifts and signs; the prompt tells Claude to ignore people
     (`src/features/eyes/useScene.ts`, `src/features/eyes/scene.ts`, `EyesScreen.tsx`).
- **People are painted over on the phone first:** before any crop or whole frame is sent (items 2–4),
  every person the on-device detector found is covered (`src/features/eyes/cropFrame.ts`). The start screen
  says what leaves the phone: product crops to Claude (Anthropic, USA), whole frames only on
  *Omgivelser* or *Identifiser hele bildet*, people covered first, nothing stored by us.
- **Fail closed:** until the on-device detector has read a frame, and after it has failed (a lost GPU
  context), nobody in view can be covered, so Øyne sends **no image at all**: the shutter (*Identifiser
  hele bildet*), taps on a box, live recognition and the *Omgivelser* scan are all off, with the reason
  on screen (*Persondekkingen er av, så Fettero sender ingen bilder. Les SKU-en på etiketten.*). The
  detector returns every detection (`maxResults: -1`), and the cover has no cap: every person it scores
  at 0.3 or more is painted grey, however many, while the screen draws only the five most likely boxes
  (`src/features/eyes/detections.ts`, `useDetector.ts`, `EyesScreen.tsx`, with tests). The start screen
  says the same: people the camera finds are covered; while the cover is loading or off, nothing is sent.
- **Honest gap:** the cover is only as good as the detector. A person it misses (far away, partly in
  view, a face in a mirror or on a screen) is not covered, and a whole frame can still show documents or
  belongings. A pilot keeps whole frames off by default and never films behind a guest's door.
- **Stored?** Not by us: the route passes the image to Anthropic and returns JSON; nothing is written
  (`src/features/eyes/imageBody.ts` caps the image at 1.5 MB). Anthropic deletes API inputs and outputs
  within 30 days unless a usage-policy hold, the law or a zero-retention agreement says otherwise (§ 3.1).
- **Identification:** none. No face model, no face matching, no guest identification anywhere in the
  code; Claude is asked only for products (`identify.ts`) or building landmarks (`scene.ts`).

## 6. Voice (Snakk gjennom roboten, Resepsjon)

- Audio streams from the browser **straight to ElevenLabs** over WebRTC. Our server only hands out a
  short-lived conversation token and never receives audio (`src/app/api/voice/token/route.ts`,
  `src/app/api/reception/token/route.ts`). The agents accept only those server-issued tokens
  (`auth: { enableAuth: true }` in both agent configs).
- **Recordings:** the receptionist is configured with `recordVoice: false` (transcripts only, 30 days).
  The staff agent (Stemme) has no such setting yet.
- **Before the call:** Resepsjon says, under *Ring resepsjonen*, where the call goes and what is kept:
  *Samtalen går til ElevenLabs (USA), som sender teksten til Claude (Anthropic, USA) for å svare. Ingen
  lydopptak lagres, og teksten slettes etter 30 dager. Dette er en demo: bruk et oppdiktet navn og
  nummer.* The notice and the agent read the same setting, so the screen can't promise more than the
  agent is configured to do (`src/features/reception/callPrivacy.ts`). Stemme is not connected on the deployed
  app today (its token route answers 503 "agenten mangler").
- **What the receptionist collects** (prompt on `main`): only what a request needs (name, phone,
  dates, guests, room type, message); never national ID, passport, date of birth, address or email;
  sensitive details such as an accessibility need only with the caller's yes; **never card numbers**,
  CVC or passwords. It says it is an AI, tells callers the hotel is responsible for their data, the
  30-day deletion, how to ask for access or deletion, and that they can complain to Datatilsynet. It
  says that only the hotel and its technical providers handle the call (it used to say "only hotel
  staff see it", which was wrong: ElevenLabs and Anthropic process it too); the live agent carries the
  new sentence only after `src/features/reception/setup-agent.ts` is run again. If a
  caller doesn't want to be written down, it records nothing. (The controller name and e-mail in the
  prompt are placeholders for the fictional hotel.)
- **A voice command never acts on its own:** Stemme's robot task only opens a confirm sheet, and
  nothing is sent until a person taps *Bekreft* (`src/features/voice/tools.ts`); it is not yet sent to
  the robot at all (`TODO(phase-3)` in `src/features/voice/VoiceScreen.tsx`).
- **No real phone number** is connected on the deployed app: the webhook tools answer 503 because no
  `RECEPTION_TOOL_SECRET` is set (checked Sat night).
- **Known gap: a phone caller hears none of the transfer information (team item: ShirazIQ's prompt in
  `src/features/reception/agentConfig.ts`).** The first message says it is the hotel's AI assistant
  and that requests are written down; the US processors, the 30 days and the rights come only "if the
  guest asks" (prompt § Privacy). The notice under *Ring resepsjonen* reaches only someone looking at
  the screen. Art. 13 asks for the information "på det tidspunktet personopplysningene innhentes",
  including the recipients (Art. 13(1)(e)), the transfer to a third country (13(1)(f)) and the
  retention period (13(2)(a)) ([Lovdata, the GDPR in Norwegian](https://lovdata.no/dokument/NL/lov/2018-06-15-38/KAPITTEL_gdpr-3)).
  A layered notice is the accepted way to do that on a call: a short first layer, the rest on request
  (Article 29 Working Party, *Guidelines on transparency*, WP260 rev.01, 11 Apr 2018, endorsed by the
  EDPB; the section on the layered approach outside a screen: paragraph **to verify**). Proposed first
  layer, appended to `firstMessage` (legal review): *«Samtalen behandles av ElevenLabs og Anthropic i USA,
  og teksten slettes etter 30 dager. Si «personvern» for mer.»* The live agent carries it only after
  `setup-agent.ts` is run again. Same file, same owner: goal 3 has the agent say in every call that
  booking direct is 10 % cheaper than the booking sites, which is true only against the prompt's
  static `otaPrice` (markedsføringsloven, § 7 below); cut it to what is always true (breakfast is
  included when booking direct) or tie it to a dated price check.

## 7. What a real deployment needs (GDPR and beyond)

- **Roles:** the hotel is the **controller**; Fettero is a **processor** with a data processing
  agreement (Art. 28): a one-page draft on the Commission's standard clauses is in
  [`docs/DPA.md`](./DPA.md). Sub-processors listed and agreed: Vercel for the pilot; Anthropic and
  ElevenLabs only if the hotel switches on the camera or the receptionist, which the pilot doesn't.
- **Transfers outside the EEA** (Anthropic, ElevenLabs, Vercel): one basis per processor, checked on
  Sun 8 Nov (§ 3.1): ElevenLabs and Vercel are on the DPF list; Anthropic is not, so its DPA's SCCs carry
  the transfer, and a transfer impact assessment comes before a pilot. EU data residency where offered
  (ElevenLabs: Enterprise only).
- **Legal basis:** legitimate interest (Art. 6(1)(f)) for staff tools (handover, routes, work orders),
  with a written balancing test; steps before a contract (Art. 6(1)(b)) for a caller's booking request;
  explicit consent for any special-category detail a guest volunteers (the receptionist asks first).
  The door-lock and energy-slot signal is a further use of the hotel's own log: its Art. 6(4) test is
  in § 10.2.
- **DPIA** (Art. 35) before a pilot: a moving camera in corridors and voice processing at scale are
  the reasons.
- **Cameras:** signage where the robot or a staff phone films; never inside an occupied room; the
  Norwegian rules on camera surveillance at work mean the staff are informed and consulted first
  (to be confirmed with a lawyer). Product crops only by default, whole-frame scans off, face blur.
- **Employee monitoring:** the run log shows who did what overnight. Use it for handover, not
  performance tracking, and say so in the staff information.
- **The robot's run log is personal data in a real hotel:** guest names, room numbers, who was let in
  or refused, which rooms were empty when. A pilot gives it a retention period (the handover period the
  hotel sets, then deleted) and redacts guest names before anything leaves the hotel's tenancy. The
  wording stays neutral: the log says "a man in a bathrobe … asked to be let in", never "suspicious
  person", because in a hotel with cameras that becomes data about a possibly innocent guest; such
  incident records get the shortest retention.
- **Children:** a camera robot in a family hotel films children, who get extra protection under the
  GDPR. They are covered like any person and never cropped; the DPIA says so.
- **The camera rule:** whether a moving robot or staff phone camera falls under the Norwegian rules on
  camera surveillance at work is an open question. We treat it as camera surveillance at work until
  Datatilsynet says otherwise.
- **Retention:** transcripts 30 days (already configured for the receptionist), Stemme the same, run
  logs deleted after the handover period the hotel sets, browser records moved to a shared store with
  its own retention.
- **Data subject rights:** one address for access and deletion requests; the receptionist already
  tells callers where to write.
- **An EU hosting path, to check before a pilot (not done):** Claude through an EU region of a cloud
  provider, ElevenLabs EU data residency, and an EU function region on Vercel (none is set today).
- **Vercel, the pilot's only sub-processor: a team check (team lead, minutes, not done).** Two facts
  to read off the Vercel dashboard and write here and in `docs/DPA.md` Vedlegg IV with the time:
  (1) **the plan**: Vercel's DPA applies to Pro and Enterprise plans (§ 3.1), so on a Hobby plan the
  pilot has no processor agreement with Vercel at all; (2) **the function region**: with no
  `vercel.json` and no project setting, functions run in `iad1`, Washington, D.C., Vercel's default;
  `"regions": ["arn1"]` in `vercel.json` puts them in Stockholm
  ([Vercel docs, *Regions*](https://vercel.com/docs/regions), region list and "Compute defaults").
  The DPF still carries the transfer to Vercel Inc. either way (§ 3.1); the region keeps the
  processing in the EU.
- **The robot in rooms:** in a pilot the robot does not open occupied rooms; it knocks, or checks rooms
  the PMS already shows as vacant, and takes no images behind a guest's door. Keys ride in a locked
  compartment.
- **Staff:** the handover names who owns what by when, and the robot's camera may film staff. Under the
  Working Environment Act (arbeidsmiljøloven) chapter 9 that is a control measure to discuss with
  employee representatives and announce before rollout, with signs where cameras film. We commit to
  no per-person performance statistics.
- **AI Act:** Art. 50 (tell people they are talking to an AI) applies in the EU from 2 August 2026,
  and the receptionist says it is an AI in its first sentence. **In Norway it does not apply yet:** on
  Sun 8 Nov 2026 EFTA's EEA-Lex lists Regulation (EU) 2024/1689 as "under scrutiny for incorporation
  into the EEA Agreement by Iceland, Liechtenstein and Norway", with no Joint Committee decision
  ([EEA-Lex 32024R1689](https://www.efta.int/eea-lex/32024R1689)); a Norwegian AI act needs that first.
  We follow Art. 50 anyway. The language model is kept out of the robot's safety loop (safety rules are
  code). That is a legal design choice as well as an engineering one, on our reading: under the AI Act
  a machine becomes high-risk through AI only where an AI system is its safety component, or is itself
  the product, under the harmonisation legislation in Annex I (Art. 6(1)), and the Machinery Regulation
  is on that list. The **Machinery Regulation (EU) 2023/1230** applies in the EU from 20 January 2027
  (its Art. 54), and a hotel robot needs CE marking under it; it is taken into the EEA Agreement by
  Joint Committee decision 171/2025 of 11 July 2025, whose entry into force is pending constitutional
  requirements ([EEA-Lex 32023R1230](https://www.efta.int/eea-lex/32023R1230), read Sun 8 Nov).
- **Prices set by the receptionist:** its discount steps are fixed in a tool and the same for every
  caller who pushes back, at most 10 % under the direct price (`src/features/reception/agentConfig.ts`):
  a published ladder, not a price personalised by automated decision-making, which the EU consumer
  rules (the Omnibus Directive, in Norway through the EEA) would require us to disclose.
- **Liability:** in Norway today a claim runs under
  [produktansvarsloven](https://lovdata.no/dokument/NL/lov/1988-12-23-104) (1988). The EU's new Product
  Liability Directive, (EU) 2024/2853, treats software as a product; EU states must transpose it by
  9 December 2026, and it reaches Norway only through the EEA (on Sun 8 Nov EEA-Lex lists it as "under
  scrutiny for incorporation", no Joint Committee decision: [EEA-Lex 32024L2853](https://www.efta.int/eea-lex/32024L2853)).
  Under it, liability to an injured person can't be excluded by contract: our terms can cap what we owe
  the hotel, not what is owed to a guest who slipped, so the one-page safety case comes before the
  first pilot. The design answer is the same either way (safety gates in code, "done" only when
  verified). One behaviour of the simulation agent must not reach a hotel: moving a warning sign off a
  floor that is still wet (`sign_move`, on for Wybe's game only); a pilot build switches it off.
- **The handover as evidence of care (legal review):** what the robot knows about a hazard, the hotel knows.
  A page that read *siden 23:51 … innen 06:30* beside a wet floor would be the first exhibit in a slip
  claim (negligence, and the employer's liability under
  [skadeserstatningsloven § 2-1](https://lovdata.no/dokument/NL/lov/1969-06-13-26/KAPITTEL_2): the
  employer answers for harm caused by intent or negligence while an employee does the work). So a
  safety item on Overlevering reads *straks*, with when the night staff were alerted, and the record
  now shows care when there was care: **a wet floor the night clerk reports carries her answer to
  *Skilt satt ut? Ja / Nei***, a required choice stored as `signed` and `signedAt`, and a sign put out
  later is its own line, so the handover says *skilt satt ut 02:16* or *uten skilt siden 02:15*
  (`src/features/staffinput/entries.ts`). **The robot's hazards reach her as they happen:** *Fra
  roboten* on `/natt` lists them at the robot's clock, each with a *Kvitter* tap that records who saw it
  and when (`src/features/staffinput/robotHazards.ts`), so the time from the robot's report to a
  person's acknowledgement is computed, not guessed: Overlevering says per hazard how long it waited
  (*6 t 9 min uten at noen ble varslet*, or *Kjersti Lund kvitterte kl. 23:53, etter 2 min*), and
  *Varsle Trond Eikeland* / *Varsle resepsjonen* records who was told, by whom and when
  (`lobby:handover-varslet`, 30 days, per hazard and append-only; it sends nothing yet, `TODO(phase-3)`); *Kvitter mottatt* says in
  one line when a safety item was told to nobody, and the receipt keeps the count
  (`src/features/handover/`). The pilot rule beyond that: a push
  to the night staffer's phone the moment the robot sees a wet floor it can't sign, escalated if nobody
  acknowledges within 10 minutes (pilot design, not built: today she sees it when she opens the
  screen).
- **The demo calls:** the team deletes its own ElevenLabs test conversations before the demo, and asks
  anyone calling the receptionist on stage to give a made-up name and number (a juror's real details
  would otherwise stay at ElevenLabs for 30 days).
- **The Norwegian acts in force today** (the docs above cite EU instruments; these are what a Norwegian
  hotel answers to now):
  - [personopplysningsloven](https://lovdata.no/dokument/NL/lov/2018-06-15-38) (2018): the GDPR as
    Norwegian law.
  - arbeidsmiljøloven chapter 9 (control measures at work: § 9-1 a legitimate reason and
    proportionality, § 9-2 discussion with the employee representatives first).
  - [forskrift om kameraovervåking i virksomhet](https://lovdata.no/dokument/SF/forskrift/2018-07-02-1107)
    (FOR-2018-07-02-1107, under arbeidsmiljøloven). Whether a moving robot's or a phone's camera falls
    under it is open (our reading, **to check with a lawyer and Datatilsynet**: it is written with fixed
    cameras in mind). We treat it as covered until told otherwise.
  - [produktansvarsloven](https://lovdata.no/dokument/NL/lov/1988-12-23-104) for liability today.
  - [markedsføringsloven](https://lovdata.no/dokument/NL/lov/2009-01-09-2/KAPITTEL_2) chapter 2 for
    the receptionist's price claims: a company is held to what its agent tells a customer (Moffatt v.
    Air Canada, BC Civil Resolution Tribunal, 2024), so any "cheaper than the booking sites" needs
    substantiation or goes.
- **The print-out:** *Skriv ut* puts guest names and the stranger incident on paper. On a real night
  the print footer says it holds personal data and is shredded after the shift; on the demo's test
  night it reads *Testdata: ingen ekte gjester.* instead, because there is nothing real to shred.
- **The safety lines are the exception to shredding (legal review; proposal, not built).** A slip claim
  runs three years from when the injured person learned of the harm and who is liable, with an outer
  limit of 20 years from the harmful act, and for some personal injury in a business none
  ([foreldelsesloven § 9](https://lovdata.no/dokument/NL/lov/1979-05-18-18/KAPITTEL_2) nr. 1 and
  nr. 2). The safety lines (the place, since when, whether a sign went out, **which role** was told and
  when: *vaktmester*, *resepsjon*, not a name) are the hotel's best evidence of care. So the proposal
  is: the hotel keeps a name-free safety extract for three years as standard, and **any line tied to a
  reported injury is held until that claim is closed**, because three years from the incident can
  run out before the deadline does. **Who keeps it:** the hotel, as controller. At the pilot's end
  Fettero hands the extract to the hotel and deletes its own copy within the same 30 days as
  everything else (`docs/DPA.md` point 6); Fettero itself keeps nothing for three years. In the pilot
  build the extract is the signed print-out (an export is `TODO(phase-3)`). Until the pilot's server
  store exists (append-only, server time), the signed print-out is the real record: `localStorage` can
  be edited or wiped at the desk.

## 8. Security basics already in place (checked in code)

| Control | Where |
|---|---|
| Passwords stored as salted **scrypt** hashes (N = 2^17, r = 8, p = 1), compared in constant time; unknown usernames checked against a dummy hash (no user enumeration by timing) | `src/features/auth/password.ts`, `src/features/auth/handlers.ts` |
| **Signed session cookie**: HMAC-SHA256, `HttpOnly`, `Secure` in production, `SameSite=Lax`, 12 h | `src/features/auth/session.ts` |
| **Roles enforced on the server** before every route (admin, resepsjonist, robotansvarlig); paid APIs need a login and the right role (checked live: `/api/identify`, `/api/scene`, `/api/voice/token`, `/api/reception/*` answer 401 without a session) | `src/proxy.ts`, `src/features/auth/access.ts`, `src/features/auth/roles.ts` |
| **Login rate limit**: 5 failed tries per IP and username, 20 per IP, per 5 minutes (per server instance) | `src/features/auth/rateLimit.ts` |
| **Per-user rate limits on the paid routes**, counted before any Claude or ElevenLabs call, 429 + `Retry-After`: `/api/identify` 40 a minute and 400 an hour, `/api/scene` 12 and 360, `/api/voice/token` and `/api/reception/token` 10 and 60 (per server instance) | `src/app/api/_lib/paidRouteLimit.ts` |
| **A separate jury account** with its own password (admin view), so the team's password is never printed; deleted after the event | `scripts/lobby-hash.mjs` |
| **CSRF**: every auth POST refuses a foreign `Origin` or `Sec-Fetch-Site: cross-site`; no open redirect after login | `src/features/auth/handlers.ts` (`isSameOrigin`), `src/features/auth/access.ts` (`safeNext`) |
| **Security headers**: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera and microphone for this origin only), and a CSP that starts from `default-src 'self'`: `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:` (no `eval` in production), styles, images and fonts from our origin, `connect-src` limited to our origin, the local viewer and ElevenLabs, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`; HSTS added by Vercel. Checked on :3300 Sun 03:05. Production (`main`) still serves the older, shorter header until it is redeployed | `next.config.ts` |
| **Keys stay on the server**: `server-only` env module; the browser gets only short-lived WebRTC tokens | `src/lib/env.ts`, `src/app/api/*/token/route.ts` |
| **Spend caps**: app Claude meter (`APP_CLAUDE_BUDGET_USD`, default USD 5); agent USD 30 file-backed ledger that fails closed; ElevenLabs agents capped at 200 calls a day, 3 at once | `src/lib/spend.ts`, `agent/brain.py`, both `agentConfig.ts` |
| **Input limits**: JPEG/PNG data URL only, 1.5 MB; JSON bodies parsed with zod and size-capped (2 KB auth, 8 KB webhook) | `src/features/eyes/imageBody.ts`, `src/features/auth/handlers.ts`, `src/features/reception/webhook.ts` |
| **Webhook secret** for the phone receptionist, compared in constant time | `src/features/reception/webhook.ts` |
| **Prompt injection**: ElevenLabs guardrails on; callers' words treated as data in the prompt; simulation text neutralised before it reaches Claude; voice tool arguments parsed with zod | both `agentConfig.ts`, `agent/brain.py` (`neutralise`), `src/features/voice/tools.ts` |
| **Secrets out of git**: gitleaks at a pinned version and checksum in CI; pre-commit and pre-push hooks | `.github/workflows/ci.yml`, `.githooks/` |
| **The agent's scored final can't start by accident**: needs `FINAL_ARMED` in the shell and the Oslo time window | `agent/guard.py` |

**Known gaps (accepted for the demo, fix before a pilot):**

- The app's Claude spend meter lives in memory per server instance, so on serverless it resets on a
  cold start; set provider-side spend limits too.
- The per-user limits on the paid routes, like the login limiter, live in memory per server instance:
  on serverless, N instances allow N times the limit. The provider-side spend limits are the hard cap.
- The team's accounts share one password (team lead's choice; `docs/checks/threat-model.md`); the jury
  has its own. Sessions can't be revoked one by one. **The named security step before a pilot:** one
  account per person with its own password, and sessions revocable one by one (`TODO(phase-3)`).
- Booking requests sit in the staff browser's `localStorage` (names, phone numbers) until settled.
- The phone receptionist's webhook tools (`/api/reception/tools/*`, no login, a shared secret) have no
  per-route limit; they fail closed today because no secret is set. Add a limit before a pilot sets it.
- Stemme's agent config has no `privacy` block (`src/features/voice/agentConfig.ts`), so the account's
  default retention applies.
- `script-src` allows `'unsafe-inline'`, because Next.js streams each page's data as small inline
  scripts; a per-request nonce minted in `src/proxy.ts` is the stricter way (`TODO(phase-3)`).
- The call log's cut-off (`RECEPTION_CALLS_SINCE`) is an env var: a deployment that doesn't set it
  shows every call the agent has. The demo laptop sets it; Vercel doesn't yet.

## 9. The name (trademark): the search is still to do

What we know is a quick check, not a clearance search:

- **FETTERO** is registered in the US for jewellery (reg. 5627248, class 14,
  [markinton](https://markinton.com/trademark/fettero-87895760)); no conflict with software on its face.
  **FETUERO** is registered in the US in class 9 (software, 2024): close enough to need the search below.
- **Domains** (whois, Sun 8 Nov about 04:05): `fettero.no` has no match at Norid (a .no needs a
  Norwegian organisation number, so it's not a today job); `fettero.com` was registered on 4 Jun 2020
  through Alibaba Cloud and is taken.
- **Ferrero.** Said aloud, Fettero is one sound from FERRERO, a mark with a reputation. Such a mark is
  protected beyond its own goods: in Norway, varemerkeloven § 4 second paragraph protects a mark that
  is *velkjent* against a similar sign for any goods or services if the use would take unfair advantage
  of, or harm, its distinctiveness or reputation
  ([Lovdata](https://lovdata.no/dokument/NL/lov/2010-03-26-8)); the EU trade mark regulation has the
  same rule. Our reading: the risk is probably low for hotel operations software (another trade, no
  confectionery link), but it's a recall risk on a noisy stage, and a trademark lawyer decides before
  any money goes into the name.

**To do (team, before anyone says "the name is clear"):** search FETTERO and close variants (FETERO,
FETTERRO, FETUERO, and FERRERO for the reputation question) in
[Patentstyret's search](https://search.patentstyret.no), [EUIPO TMview](https://www.tmdn.org/tmview/)
and the [WIPO Global Brand Database](https://branddb.wipo.int), in classes 9, 42 and 43, plus the
identical word in any class. Write the result and the date here and in `docs/DEMO.md` § 6.1. An
automated TMview query was refused by the site's bot protection on Sun 8 Nov, so this is done by hand.

## 10. The pilot's data sources: the door-lock signal, the energy slot and the night clerk

The pilot is software only (`docs/DEMO.md` § 7): it reads the booking system (read-only), the door
lock, the energy slot and the night clerk's own entries. Not the camera, not the voice. This section
answers the question a hotel's lawyer asks first (the legal review's question): on what basis does the hotel hand
over its door-lock data, and what stops it becoming staff monitoring. Read against primary sources on
Sun 8 Nov, about 05:30: the GDPR in Norwegian on Lovdata (Art. 6(4), 13, 28), arbeidsmiljøloven
chapter 9 on Lovdata (and, at about 07:45, for room 210: utlendingsforskriften § 4-25 and forskrift om
brannforebygging § 12), and the regulators' joint guide on control and monitoring at work
([*Veileder om kontroll og overvåking i arbeidslivet*](https://www.datatilsynet.no/personvern-pa-ulike-omrader/personvern-pa-arbeidsplassen/veileder-om-kontroll-og-overvaking-i-arbeidslivet/),
Datatilsynet, Arbeidstilsynet and Petroleumstilsynet with the social partners, 2019; the section
*Adgangskontroll*, pp. 34–35 of the [PDF](https://www.arbeidstilsynet.no/contentassets/04ec2eb566d44942bd6693e9e3a0c99e/veileder-om-kontroll-og-overvaking-2019.pdf)).
Our reading, not legal advice.

### 10.1 What Fettero takes: one signal per room, no card id, no clock

| Source at the hotel | What it holds | What reaches Fettero | Never |
|---|---|---|---|
| The lock system's audit trail (ASSA ABLOY, Salto, dormakaba and others) | Every card at every door: guests', housekeepers', porters', master and emergency cards | Per guest room, one value **with no clock**: no **guest-card** entry at the door since 18:00, the start of the window | the card's id, the guest's name, the time of any entry, any staff, master or emergency card, any door that isn't a guest room |
| The energy slot (the card switch in the room), where a room-control system reports it | Whether a card sits in the slot, sometimes which card | Folded into the same value: a guest card is in the slot (a yes, no clock), or none all window | whose card, since when |
| The night clerk's phone (§ 10.3) | What she checked and wrote | Room, finding, time, her name | — |

On screen the signal reads *rom 213: ingen kort i energibryteren siden kl. 18:00* (the window, not a
guest's time) or *kort i energibryteren* (a yes): **ett signal per rom, aldri kort-id, aldri
klokkeslett.** We no longer say *aldri hvem* (legal review): next to the booking, *no guest card in 213
since 18:00* is information about the guest booked there, Ola Nygård, so it is personal data
(Art. 4(1)) even with no card id and no clock. (The screens say the same: `/natt`, the line under the
Med robot / Uten robot switch and the pilot line on Rom all read *aldri kort-id, aldri klokkeslett*.) In the
demo it is a team-written sample in the run-log format, one `room_signal` line per room (`no_card` with
only the window, or `card_in` with no clock, source `door_lock`; `src/features/doorlock/feed.ts`,
labelled *Testdata: dørlåsens signal er skrevet av teamet*). A time a feed sends on `card_in` anyway is
dropped on read, and tests check that no line carries a guest's clock (`feed.test.ts`). On the night
clerk's screen the lock line shows only on a room where the lock and the booking system disagree, and
an unflagged booked room reads *booket til 9.11*, without the guest's name, with *bank på og vent*
before she goes in (`src/features/staffinput/NightClerkScreen.tsx`). No lock system has been connected
or seen yet.

- **Where the reduction happens:** on the hotel's side, before anything leaves it. Best case, the lock
  vendor's report or API gives the per-room value. If the only export is the raw audit trail, it is
  reduced on the hotel's own machine before it is sent, or we don't take it. Which vendors can give a
  per-room report: **to verify**, vendor by vendor.
- **Offline locks:** many hotels run locks whose audit trail is read at the door with a handheld, and
  have no networked room control (founders and domain review). Then there is no signal at night, and the pilot
  runs on the night clerk's check (§ 10.3): slower, but nothing legal stops it. How many target hotels
  have online locks is a phone-round question (`docs/DEMO.md` § 8.1).
- **Retention:** the signal is deleted 24 hours after the handover it fed (our proposal; the hotel sets
  it in the DPA). For scale: the regulators' guide gives 90 days as the normal maximum for raw access
  logs in Datatilsynet's practice (p. 35, *«Under normale omstendigheter vil 90 dager … være maksimal
  lagringstid for passeringsopplysninger»*).
- **Never on its own:** the signal never sells a room. A named receptionist confirms the folio, the
  bags and the key card, then the manager sends it to reception, and the booking system stays the truth
  (read-only; `docs/PRD.md` § 6).

### 10.2 The hotel's basis: the Art. 6(4) compatibility test

The hotel is the controller of its lock log and collected it to secure the rooms and control who
enters them. The page uses the per-room signal for **two further purposes**, and each gets its own
test:

- **Room 213, empty after departure:** the booking system still holds a room the guest has left.
  Purpose: tell it early, so reception can confirm and re-let it.
- **Room 210, in use with no booking** (the page's lead money figure, added after the legal review):
  a guest card sits in the slot of a room the booking system has free. Purpose: **the occupant's
  safety and knowing who is in the building**: no second guest sold into an occupied room, and a guest
  register that is right. The hotel must keep a register of *everyone* who stays overnight
  (utlendingsforskriften § 4-25: *«Den som driver hotell, pensjonat, losjihus, leirplass og lignende
  skal føre fortegnelse over alle som overnatter»*,
  [Lovdata](https://lovdata.no/dokument/SF/forskrift/2009-10-15-1286/KAPITTEL_4), under utlendingsloven
  § 20), and the user of a building must have *«rutiner for evakuering og redning ved brann»*
  (forskrift om brannforebygging § 12 b,
  [Lovdata](https://lovdata.no/dokument/SF/forskrift/2015-12-17-1710/KAPITTEL_3)). That an evacuation
  routine counts heads against the register is common practice and our reading, not a quoted duty
  (**to verify** with a lawyer and the fire service). **The kroner are a side effect, not the
  purpose:** an unregistered occupant is first a safety and registration gap; the unbilled night
  follows from closing it.

Where a further purpose rests neither on consent nor on law, Art. 6(4) has the controller weigh, among
other things, five points ([Lovdata](https://lovdata.no/dokument/NL/lov/2018-06-15-38/KAPITTEL_gdpr-2)).
The hotel's test, one line per point and purpose:

| Art. 6(4) | Room 213: empty after departure | Room 210: in use with no booking |
|---|---|---|
| (a) the link between the purposes | Both are about who uses the room the guest paid for; the further one serves the same rooms. | Close: the lock exists to control who is in the rooms; knowing a room is occupied when the register says nobody is there is that same control, and serves a duty the hotel already has (§ 4-25 above). |
| (b) the context, the relation between guest and hotel | The guest's card opens the guest's own room; that the hotel knows a room hasn't been entered since the departure date is within what a guest expects, and the hotel's privacy notice says it (below). | An occupant expects the hotel to know someone is in the room, and to register them; a guest checking in later expects not to be sold an occupied room. The privacy notice says it (below). |
| (c) the nature of the data | No special categories, nothing on offences; one value per room, not a movement trail. | The same one value per room (a guest card in the slot, no clock, no card id). Who coded the card is never asked (§ 10.3). |
| (d) the possible consequences for the guest | The worst case is a room offered while a guest still has a right to it. It can't be sold on the signal: a named receptionist confirms first, and the booking system decides. | For the occupant: being asked to register, or to pay for a night they used. For the next guest: protection from being walked into an occupied room. Nothing happens on the signal alone: the desk checks with the guest and the registration. |
| (e) safeguards | Reduced on the hotel's side, no card ids or names, staff cards removed at the source, deleted after 24 hours, a processor bound by Art. 28 (`docs/DPA.md`). | The same, plus the contract line that Fettero is never used to find out who coded a card or to investigate an employee (`docs/DPA.md` point 5, § 10.3). |

Our reading: 210 is the stronger of the two compatibility cases under (a) and (d), as long as it is
run as occupant safety and not as a billing hunt (**to verify** with a lawyer before the pilot).

Recital 50: where the further purpose is compatible, no legal basis separate from the one that
allowed the collection is required. Because views differ on how far that reaches, the hotel also writes
down a legitimate-interest balancing (Art. 6(1)(f)) for the same use: belt and braces, and a lawyer
confirms before the pilot (**to verify**).

Two sentences for the hotel's privacy notice: *«Vi bruker dørlåsens logg til å se om et rom står tomt
etter avreise, slik at det kan selges igjen, og om et rom er i bruk uten registrert opphold, så ingen
ny gjest selges inn i et bebodd rom og gjestelisten er riktig. Fra dørlåsen får vår leverandør
Fettero bare ett ja/nei per rom, aldri kort-id, aldri klokkeslett; sammen med bookingen er det en
opplysning om deg, og den slettes etter 24 timer.»* (It no longer says *aldri hvem*: next to the
booking the signal is about the booked guest, and a notice must not tell a guest otherwise.)

### 10.3 Staff: not a control measure, and the night clerk's entries

- **The lock log is staff data too.** The regulators' guide: card passages *«er opplysninger om den
  enkelte ansatte som kortet er utstedt til»*; ordinary access control is *«vanligvis … et saklig og
  lite inngripende kontrolltiltak»*; its purpose must be written down; and *«I utgangspunktet kan ikke
  opplysningene i adgangskontrollsystemet brukes til andre formål»* (p. 34). So Fettero never receives a
  staff, master or emergency card event: they are removed at the source. Were a pilot to read them, it
  would be a control measure under [arbeidsmiljøloven](https://lovdata.no/dokument/NL/lov/2005-06-17-62/KAPITTEL_10)
  § 9-1 (it needs *«saklig grunn i virksomhetens forhold»* and must not be *«en uforholdsmessig
  belastning for arbeidstakeren»*), to be discussed with the employees' representatives *«så tidlig som
  mulig»* (§ 9-2) before rollout. That is weeks, not Monday; excluding staff cards at the source is
  what lets the pilot start.
- **Room 210 points at the desk, and Fettero does not follow it (legal review).** A guest card in a
  room with no booking was coded by someone, and the lock's encoder log can name who. The moment a
  manager uses the 210 row to find out who, the handover has become a control measure under § 9-1,
  and the guide's *«I utgangspunktet kan ikke opplysningene i adgangskontrollsystemet brukes til andre
  formål»* applies. So the contract says it: **Fettero brukes aldri til å finne ut hvem som kodet et
  kort eller til å granske en ansatt** (`docs/DPA.md` point 5). A 210 is resolved with the guest and
  the registration, not with the lock's staff log; Fettero never receives an encoder or staff event,
  so it couldn't answer the question anyway. If a hotel wants the encoder log for an investigation,
  that is the hotel's own control measure, discussed under § 9-2 first, and outside the pilot.
- **Response times are about a named person too.** *Kjersti Lund kvitterte kl. 23:53, etter 2 min*
  and *Varslet … · Siri Haugen · nå* are times tied to a name, kept 30 days; a manager could add them
  up into a per-person response time. The DPA's point 5 names response times explicitly as something
  Fettero never aggregates per person, and the § 9-2 conversation with the employee representatives
  covers the *Kvitter* even for the software-only pilot, because it is new compared with the paper
  *vaktbok*.
- **The night clerk's entries** (*Nattevaktens logg*, `/natt`, `src/features/staffinput/`; the input
  behind *Uten robot*, `docs/DEMO.md` § 2): she taps a room (*Tom og ryddig*, *Ikke tom*, *Trenger
  vask*), a safety item with its place (*Vått gulv*, *Dør*, *Person*), or writes a short note (at most
  280 characters), and each becomes a run-log line with source `staff`, her name and the time. That is
  staff data: her name and what she recorded, for the handover, like the paper *vaktbok* it replaces.
  Basis: the hotel's legitimate interest in a safe handover. *Angre* adds a correction line and never
  deletes one, so the log stays a record. In the pilot build the entries stay **on that device**, per
  handover day, **for 30 days** (`RETENTION_DAYS`, pruned on load and on every write; the screen says
  *Lagres på denne enheten i 30 dager*; a server store with the same retention is `TODO(phase-3)`). A
  wet floor records whether a sign went out (*Skilt satt ut? Ja / Nei*). Free
  text can hold guest details, so the note is for the room and the task, never a guest's health. The
  demo's entries are a sample night, labelled as test data.
- **The rule we sign up to: no per-person performance statistics, ever.** The page counts the robot's
  conduct (*10 av 15 nøkkelkortinnganger uten banking*), never a person's. The receptionist named in
  213's confirmation, and the manager who sends it on, are recorded so the hotel can show it checked
  before reselling, not to score them. The record says what happened, both names once: *Bekreftet av
  Hanne Vold (resepsjon) · registrert av Siri Haugen*, because the receptionist does not log in herself
  in the pilot build; the manager types her name. In one line for the staff and their representatives:
  **Fettero signerer for nattevakten, ikke på henne.**
