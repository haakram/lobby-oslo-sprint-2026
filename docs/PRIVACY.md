# PRIVACY.md — Personal data, processors and security in Fettero

> For the jury's lawyer and security reviewer, and for us. Short and honest: what the hackathon build
> does today, checked in the code on Sun 8 Nov morning (`hamad/jury-loop`; the product trades as
> Fettero there, while code identifiers keep the old `lobby` names), and what a real hotel deployment
> would still need. Not legal advice; a
> pilot needs a lawyer's review. The full threat model for login and roles is in
> [`docs/checks/threat-model.md`](./checks/threat-model.md).

## 1. In one paragraph

The demo touches **no real guest or employee data**. Guests, staff, stock and work orders are made-up
test data, marked on every screen ("Testdata til integrasjonen er på plass."). The robot's night comes
from Wybe's hotel simulation, whose guests are fictional. The only real people in the system are the
team: the login accounts, and our own test calls to the AI receptionist, which **the team deletes in
ElevenLabs before the Sunday 14:00 demo** so no real caller reaches a projector. There is **no database**.
Camera frames and voice go to two AI processors, **Anthropic (Claude API)** and **ElevenLabs**, both
outside the EEA. Nothing identifies people: there is no face recognition anywhere in the code.

## 2. What personal data the demo touches

| Data | Real? | Where it comes from |
|---|---|---|
| Guest names, rooms, arrivals, special needs | No: invented test data | `src/features/guests/testData.ts` (`TODO(phase-3)`: PMS integration) |
| Staff names and shifts | No: invented | `src/features/staff/testData.ts` |
| Guest names in the robot's night ("Dr Silva", "Ms Rossi") | No: Wybe's simulation | `public/runs/demo.jsonl` (live practice night of the final agent, seed 16) |
| The host view's flats, guests and messages | No: invented | `src/features/host/demoData.ts` |
| Login accounts (`hamad`, `shiraz`, `resepsjon`, `robot`, `vert`, and `jury` for the event) | Team only; the jury account has its own password and is deleted after the event | `LOBBY_USERS` env var, scrypt hashes, never passwords (`scripts/lobby-hash.mjs`) |
| Receptionist calls: caller name, call-back number, dates, a summary | Only the team's own test calls, deleted before the demo | Held by ElevenLabs; read back on demand (§ 4); phone numbers masked on every screen |
| Camera frames | Whatever the phone sees | Øyne (§ 5) |
| Voices | Whoever speaks to Stemme or Resepsjon | Streamed to ElevenLabs (§ 6) |

## 3. Processors (who receives what)

| Processor | Receives | From | Location |
|---|---|---|---|
| **Anthropic (Claude API)** | Product crops and some whole camera frames (Øyne); request text from the simulation when the agent's parser can't read it (rare: the agent's whole Claude spend this weekend is about USD 0.001, `temp/spend.json`) | `src/features/eyes/identify.ts`, `src/features/eyes/scene.ts`, `agent/brain.py` | US company; outside the EEA |
| **ElevenLabs** | Voice audio, transcripts, post-call fields (`caller_name`, `callback_number`, dates, room type, guests, summary); uses Claude as the LLM inside its agents (billed by ElevenLabs, so Anthropic is a sub-processor there) | `src/features/voice/agentConfig.ts`, `src/features/reception/agentConfig.ts` | Outside the EEA |
| **Vercel** | Hosting: every request passes through it | the deployment | US company; no function region is set in the repo, so the platform default applies (check in the project settings) |

No analytics, no ad trackers, no third-party fonts at runtime (`next/font` self-hosts them), no CDN
for the camera model (served from our own origin, `src/features/eyes/useDetector.ts`). MediaPipe's
library has telemetry to Google built in (`odml.pa.googleapis.com`, found by the jury's lawyer in
round 1); the Content-Security-Policy's `connect-src` allows only our own origin, the local 3D viewer
and ElevenLabs, so the browser blocks that call (`next.config.ts`).

## 4. What is stored where

| Store | What | Retention |
|---|---|---|
| **Session cookie** `lobby_session` | Username, role, view, expiry; HMAC-SHA256 signed, nothing secret inside (`src/features/auth/session.ts`) | 12 hours |
| **Run logs** (JSONL) | Every API call the agent made in the simulation, its decisions, the sim's fictional guests | Agent laptop `temp/runs/` (gitignored), kept for the event. One recorded night is committed (`public/runs/demo.jsonl`, seed 16) and served only behind login (`src/features/auth/roles.ts`, `SHARED_ROUTES`) |
| **The browser** (`localStorage`) | The receptionist's booking requests and messages until staff settle them (validated, newest 50: `src/features/reception/useStoredRecords.ts`), staff ticks, work-order statuses (`src/features/dashboard/useOrderStatuses.ts`) | Until staff clear them or the browser data is cleared. On the staff device only; no server copy (`TODO(phase-3)`: a shared store) |
| **ElevenLabs** | Receptionist conversations: transcript and post-call fields, **no audio** | 30 days, set in the agent config on `main` (`privacy: { recordVoice: false, retentionDays: 30 }`, `src/features/reception/agentConfig.ts`). **Not verified** that the live agent carries it: check the agent's settings in ElevenLabs |
| **ElevenLabs** | Stemme (staff voice) conversations | No retention setting in `src/features/voice/agentConfig.ts`: the account default applies. Set it before any pilot |
| **Our server** | Nothing. No database, no file writes. Logs carry only error types or HTTP status, never bodies (`src/app/api/identify/route.ts`, `src/app/api/voice/token/route.ts`, `src/app/api/reception/tools/[tool]/route.ts`: "Arguments are never logged") | — |

Call notes shown in Resepsjon are read from ElevenLabs on demand (`src/app/api/reception/calls/route.ts`,
login required), cleaned of card numbers and control characters (`src/features/reception/scrub.ts`), and
not stored by us. Phone numbers are masked on the server where the notes are mapped ("+47 ••• •• 493",
`src/features/reception/maskPhone.ts`, `callLog.ts`), so Oversikt, Forespørsler, the bell and Resepsjon
never show a full number; the full number reaches a logged-in receptionist's or admin's browser only
inside the *Ring tilbake* `tel:` link.

## 5. Camera frames (Robotens øyne)

- **On the device first.** MediaPipe's object detector (EfficientDet-Lite0) draws the boxes in the
  browser; that part sends nothing (`src/features/eyes/useDetector.ts`).
- **What is sent to Claude** (as a JPEG, through our server, `src/app/api/identify/route.ts` and
  `src/app/api/scene/route.ts`):
  1. **Automatically:** a crop (at most 768 px) of a box whose class is product-like. **People are
     never cropped and sent**: `person`, furniture, vehicles and animals keep their free label only
     (`src/features/eyes/cocoLabels.ts` `PRODUCT_CLASSES`, `src/features/eyes/autoIdentify.ts`).
  2. **On a tap:** the crop of the tapped box.
  3. **"Identifiser hele bildet":** the whole frame, at most 768 px (`src/features/eyes/EyesScreen.tsx`).
  4. **"Omgivelser" scan (off by default; a person must switch it on):** the whole frame, at most 640
     px, once every 10 seconds, to find doors, lifts and signs; the prompt tells Claude to ignore people
     (`src/features/eyes/useScene.ts`, `src/features/eyes/scene.ts`, `EyesScreen.tsx`).
- **People are painted over on the phone first:** before any whole frame is sent (items 3 and 4), every
  person the on-device detector found is covered (`src/features/eyes/cropFrame.ts`). The start screen
  says what leaves the phone: product crops to Claude (Anthropic, USA), whole frames only on
  *Omgivelser* or *Identifiser hele bildet*, people covered first, nothing stored by us.
- **Honest gap:** the cover is only as good as the detector. A person it misses (far away, partly in
  view, a face in a mirror or on a screen) is not covered, and a whole frame can still show documents or
  belongings. A pilot keeps whole frames off by default and never films behind a guest's door.
- **Stored?** Not by us: the route passes the image to Anthropic and returns JSON; nothing is written
  (`src/features/eyes/imageBody.ts` caps the image at 1.5 MB). Anthropic's own retention under its
  commercial API terms applies (not checked by us for this build).
- **Identification:** none. No face model, no face matching, no guest identification anywhere in the
  code; Claude is asked only for products (`identify.ts`) or building landmarks (`scene.ts`).

## 6. Voice (Snakk gjennom roboten, Resepsjon)

- Audio streams from the browser **straight to ElevenLabs** over WebRTC. Our server only hands out a
  short-lived conversation token and never receives audio (`src/app/api/voice/token/route.ts`,
  `src/app/api/reception/token/route.ts`). The agents accept only those server-issued tokens
  (`auth: { enableAuth: true }` in both agent configs).
- **Recordings:** the receptionist is configured with `recordVoice: false` (transcripts only, 30 days;
  `main`). The staff agent (Stemme) has no such setting yet. Stemme is not connected on the deployed
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
- **Transfers outside the EEA** (Anthropic, ElevenLabs, Vercel): a transfer basis per processor
  (standard contractual clauses, or the EU-US Data Privacy Framework where the company is certified;
  not checked by us), or EU data residency where offered.
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
- **AI Act:** the receptionist says it is an AI in its first sentence (Art. 50). The language model is
  kept out of the robot's safety loop (safety rules are code), which matters if the robot is ever
  assessed as machinery.
- **Liability:** the EU's new Product Liability Directive, (EU) 2024/2853, treats software as a
  product; the design answer is the same (safety gates in code, "done" only when verified), and a pilot
  writes it up as a one-page safety case.
- **The demo calls:** the team deletes its own ElevenLabs test conversations before the demo, and asks
  anyone calling the receptionist on stage to give a made-up name and number (a juror's real details
  would otherwise stay at ElevenLabs for 30 days).

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
| **Security headers**: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` and a `connect-src` limited to our origin, the local viewer and ElevenLabs, `Permissions-Policy` (camera and microphone for this origin only); HSTS added by Vercel | `next.config.ts` |
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
- A stale comment in `src/app/api/reception/calls/route.ts` says anyone with the URL can read call
  notes; that predates the login, and the route now answers 401 without a session.
