# PRIVACY.md — Personal data, processors and security in Fettero

> For the jury's lawyer and security reviewer, and for us. Short and honest: what the hackathon build
> does today, checked in the code on Sun 8 Nov at about 03:00 (`hamad/jury-loop`; the product trades as
> Fettero there, while code identifiers keep the old `lobby` names), and what a real hotel deployment
> would still need. The transfer basis per processor (§ 3.1) was checked against primary sources (the
> DPF list, each vendor's DPA) at about 04:00 the same morning. Not legal advice; a
> pilot needs a lawyer's review. The full threat model for login and roles is in
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
outside the EEA. Nothing identifies people: there is no face recognition anywhere in the code.

## 2. What personal data the demo touches

| Data | Real? | Where it comes from |
|---|---|---|
| Guest names, rooms, arrivals, special needs | No: invented test data | `src/features/guests/testData.ts` (`TODO(phase-3)`: PMS integration) |
| Staff names and shifts | No: invented | `src/features/staff/testData.ts` |
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
| **Vercel** | Hosting: every request passes through it | the deployment | US company; no function region is set in the repo, so the platform default applies (check in the project settings) |

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
challenges. If it fell, ElevenLabs and Vercel would move to the SCCs already in their DPAs, as Anthropic
uses today.

No analytics, no ad trackers, no third-party fonts at runtime (`next/font` self-hosts them), no CDN
for the camera model (served from our own origin, `src/features/eyes/useDetector.ts`). MediaPipe's
library has telemetry to Google built in (`odml.pa.googleapis.com`, found by the jury's lawyer in
round 1). The app answers that one host on the phone before any request exists, so it never leaves the
device (`src/features/eyes/noTelemetry.ts`), and the Content-Security-Policy's `connect-src` (only our
own origin, the local 3D viewer and ElevenLabs) is the backstop (`next.config.ts`). **On this build
only:** the public URL (lobby-sandy.vercel.app) serves `main`, whose older header has no `connect-src`
(curl, Sun 02:50), so there the browser would let that call out.

## 4. What is stored where

| Store | What | Retention |
|---|---|---|
| **Session cookie** `lobby_session` | Username, role, view, expiry; HMAC-SHA256 signed, nothing secret inside (`src/features/auth/session.ts`) | 12 hours |
| **Run logs** (JSONL) | Every API call the agent made in the simulation, its decisions, the sim's fictional guests | Agent laptop `temp/runs/` (gitignored), kept for the event. One recorded night is committed (`public/runs/demo.jsonl`, seed 16) and served only behind login (`src/features/auth/roles.ts`, `SHARED_ROUTES`) |
| **The browser** (`localStorage`) | The receptionist's booking requests and messages until staff settle them (validated, newest 50: `src/features/reception/useStoredRecords.ts`), staff ticks, work-order statuses (`src/features/dashboard/useOrderStatuses.ts`), the room releases and the handover sign-off with the user's name (the screen says *lagret på denne enheten*) | Until staff clear them or the browser data is cleared. On the staff device only; no server copy (`TODO(phase-3)`: a shared store) |
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

## 7. What a real deployment needs (GDPR and beyond)

- **Roles:** the hotel is the **controller**; Fettero is a **processor** with a data processing
  agreement (Art. 28). Sub-processors listed and agreed: Anthropic, ElevenLabs, Vercel.
- **Transfers outside the EEA** (Anthropic, ElevenLabs, Vercel): one basis per processor, checked on
  Sun 8 Nov (§ 3.1): ElevenLabs and Vercel are on the DPF list; Anthropic is not, so its DPA's SCCs carry
  the transfer, and a transfer impact assessment comes before a pilot. EU data residency where offered
  (ElevenLabs: Enterprise only).
- **Legal basis:** legitimate interest (Art. 6(1)(f)) for staff tools (handover, routes, work orders),
  with a written balancing test; steps before a contract (Art. 6(1)(b)) for a caller's booking request;
  explicit consent for any special-category detail a guest volunteers (the receptionist asks first).
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
- **The robot in rooms:** in a pilot the robot does not open occupied rooms; it knocks, or checks rooms
  the PMS already shows as vacant, and takes no images behind a guest's door. Keys ride in a locked
  compartment.
- **Staff:** the handover names who owns what by when, and the robot's camera may film staff. Under the
  Working Environment Act (arbeidsmiljøloven) chapter 9 that is a control measure to discuss with
  employee representatives and announce before rollout, with signs where cameras film. We commit to
  no per-person performance statistics.
- **AI Act:** Art. 50 (tell people they are talking to an AI) applies in the EU from 2 August 2026,
  and the receptionist says it is an AI in its first sentence. In Norway the AI Act applies only once it
  is taken into the EEA Agreement and a Norwegian act puts it into force; its status today is **to
  verify** (we don't write "applies in Norway from 2 August 2026"). The language model is kept out of the
  robot's safety loop (safety rules are code), which matters under the Machinery Regulation (EU)
  2023/1230, which applies in the EU from 20 January 2027 and under which a hotel robot needs CE marking
  (EEA status in Norway: **to verify**).
- **Prices set by the receptionist:** its discount steps are fixed in a tool and the same for every
  caller who pushes back, at most 10 % under the direct price (`src/features/reception/agentConfig.ts`):
  a published ladder, not a price personalised by automated decision-making, which the EU consumer
  rules (the Omnibus Directive, in Norway through the EEA) would require us to disclose.
- **Liability:** in Norway today a claim runs under
  [produktansvarsloven](https://lovdata.no/dokument/NL/lov/1988-12-23-104) (1988). The EU's new Product
  Liability Directive, (EU) 2024/2853, treats software as a product; EU states must transpose it by
  9 December 2026, and it reaches Norway only through the EEA. The design answer is the same either way
  (safety gates in code, "done" only when verified), and a pilot writes it up as a one-page safety
  case. One behaviour of the simulation agent must not reach a hotel: moving a warning sign off a floor
  that is still wet (`sign_move`, on for Wybe's game only); a pilot build switches it off.
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
- **The print-out:** *Skriv ut* puts guest names and the stranger incident on paper. A pilot's print
  footer says it holds personal data and is shredded after the shift.

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
  has its own. Sessions can't be revoked one by one.
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
