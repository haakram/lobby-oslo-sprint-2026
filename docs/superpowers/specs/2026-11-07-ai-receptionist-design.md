# AI receptionist (Resepsjon) — design

Owner: ShirazIQ (Track B). Status: built on `shiraziq/receptionist`; **scope needs Hamad's OK** (it
is outside the agreed PRD). Date: 2026-11-07.

## 1. Why

The hotel's biggest money leak is the phone, not the night shift (`Hotell-problemer-Nattskift.pdf`,
problems 1 and 2): 14 % of hotel calls fail or are mishandled (Marchex), callers who get no answer
book elsewhere, and booking sites take 15–25 % commission. ShirazIQ's words: too many calls, many
guests never get called back, and phone bookings should happen directly instead of through booking
sites.

Story for the pitch: *the robot handles the night shift, the receptionist handles the phone.*

## 2. What it does

A second hosted ElevenLabs agent, **the receptionist** of the made-up **Hotell Nattskift** (Oslo).
A guest calls (browser now, a phone number later) and the receptionist:

1. **Answers in the guest's language** with a natural multilingual voice, switching when they switch.
2. **Answers questions** about the hotel (check-in times, breakfast, parking, location, pets, …) from
   test facts in its prompt, and **prices** from a tool so it never invents a number.
3. **Checks availability** for dates, guests and room type, and offers the **direct-booking benefit**
   (10 % below the booking-site price, breakfast included) — that is the anti-commission pitch.
4. **Takes a booking request** (name, phone, dates, room, guests). It is a *request*: staff confirm it
   on `/resepsjon`. The receptionist never says a room is booked and never takes payment or cards.
5. **Takes a message / callback request** (name, phone, what it is about, urgent or not), so no caller
   is forgotten. Staff tick it off on `/resepsjon`.
6. **Is efficient:** short answers, one question at a time, ends the call politely when done or after
   long silence.

Staff screen `/resepsjon` (Norwegian, `DESIGN.md`): talk to the receptionist in the browser (same orb
and transcript as Stemme), see this call's requests live with **Bekreft** / **Avvis** (booking) and
**Ringt tilbake** (message), and a **Samtalelogg** of recent calls (browser and phone) read from
ElevenLabs' conversation history.

## 3. Goals, non-goals, anti-goals

- **Goals:** a believable demo call in Norwegian and English; correct answers for prices and
  availability; every booking or message ends up on the staff screen; odd input never crashes or
  tricks it; phone-ready design.
- **Non-goals:** a real hotel system (PMS), payments, sending SMS/e-mail confirmations, outbound
  calls, staff log-in, a database.
- **Anti-goals (a failure even if it works):** the agent says "your room is booked"; it reads back or
  stores a card number; a caller talks it into a discount, a free room or new instructions; a price or
  room that does not exist in the data; English or emoji in the UI.

## 4. Decisions (my calls; ShirazIQ said "just start")

| # | Decision | Why |
|---|---|---|
| D1 | Reuse the Stemme stack: hosted ElevenLabs agent, Claude (`claude-sonnet-5-5`) as LLM, `language_detection`, zod-validated tools, server-issued conversation token. | Already built and reviewed; LLM billed by ElevenLabs, not our USD 30 Claude cap. |
| D2 | Hotel facts, rooms and prices are made-up test data in `src/features/reception/hotel.ts`. Facts go in the prompt; prices and availability come from tools. | Prompt facts are cheap; numbers must be exact and testable. |
| D3 | Four tools: `get_room_price`, `check_availability`, `record_booking_request`, `record_message`. All read data or record a request; nothing has an effect without a staff tap. | Speech is untrusted (AI_RULES R3.3, research note). |
| D4 | Tool mode: **client tools** (browser) by default; **webhook tools** to `/api/reception/tools/<name>` when `RECEPTION_PUBLIC_URL` is set at setup. Same pure handlers for both. | A phone call has no browser, so phone needs webhooks; the browser demo needs no public URL. |
| D5 | Webhook calls carry a shared secret header (`x-reception-secret`), stored at ElevenLabs as a workspace secret, compared in constant time. | Anyone on the internet could call a public route otherwise. |
| D6 | Call log = ElevenLabs conversation history for the receptionist agent, with **data collection** fields. Staff ticks (Bekreft, Avvis, Ringt tilbake) live in the browser's `localStorage`. `TODO(phase-3)`: a real store. | No DB in our stack; works for browser and phone calls alike. |
| D7 | Availability is deterministic from the date and room type (a small hash) plus fixed sold-out dates; "today" is Europe/Oslo. | Repeatable demo and tests; always some sold-out days to show. |
| D8 | Card numbers: the prompt forbids them, and every free-text field is scrubbed (13–19 digit runs → `[kortnummer fjernet]`). | Defence in depth; never store one even if said. |
| D9 | Voice: a warm multilingual ElevenLabs voice (`VOICE_ID` constant), `eleven_v4_turbo` like Stemme. ShirazIQ hears it first and may swap it. | "Natural, real-sounding voice." |
| D10 | Language: default Norwegian; presets for en, sv, da, de, es, fr, pl, uk, ar, zh. Unknown language → the agent answers in English and says it can also speak Norwegian. | Hotel guests are international. |
| D11 | Nav: a fifth tab **Resepsjon** with a new hand-drawn `PhoneIcon`, and a home card. | One more screen in the same app. |

## 5. Data (test)

Hotell Nattskift, Oslo. Check-in 15:00, check-out 11:00, breakfast 06:30–10:30 (245 kr when not
included), parking 250 kr/night, pets allowed in some rooms (150 kr/night), Wi-Fi free, reception
staffed 07:00–23:00 (the receptionist takes calls 24/7).

| Room type (id) | Name | Max guests | Rooms | Booking-site price / night |
|---|---|---|---|---|
| `enkeltrom` | Enkeltrom | 1 | 10 | 1 290 kr |
| `dobbeltrom` | Dobbeltrom | 2 | 20 | 1 690 kr |
| `familierom` | Familierom | 4 | 6 | 2 390 kr |
| `suite` | Suite | 2 | 2 | 3 490 kr |

Direct price = booking-site price × 0.9, rounded to whole kroner, breakfast included.

## 6. Tool contracts

All arguments come from speech: parsed with zod, trimmed, length-capped. Replies are short plain
bokmål strings (the agent speaks the guest's language). Dates are `YYYY-MM-DD`.

- `get_room_price { room }` → price per night (direct and booking-site) or "no such room, we have …".
  Room names are matched loosely (id, Norwegian name, English name, case-insensitive).
- `check_availability { arrival, departure, guests, room? }` → which room types are free for every
  night, with the direct total; or a clear error: unparseable date, arrival in the past, departure not
  after arrival, more than 30 nights, more than 365 days ahead, guests < 1 or > 8, no room type fits
  the guests, unknown room, sold out (with the nearest free arrival date within 14 days if any). Every
  reply includes today's date.
- `record_booking_request { name, phone, arrival, departure, guests, room, note? }` → validates like
  `check_availability` (refuses sold-out or impossible requests), scrubs text, records it as
  **Venter** (waiting for staff). Reply tells the agent: not booked yet, staff confirm by phone.
- `record_message { name, phone, topic, message, urgent? }` → `topic` one of `booking`, `question`,
  `complaint`, `lost_item`, `other`; message ≤ 600 characters after scrubbing (longer is cut, with
  "…"). Records it as **Ring tilbake**.

Phone numbers: digits, spaces, `+`, `-`, `()` only; 8–15 digits. Names: 1–80 characters, control
characters removed. At most 10 recorded items per call (a flood is refused).

## 7. Agent behaviour (prompt)

Persona: warm, efficient hotel receptionist. Asks one thing at a time, confirms dates by repeating
them, gives prices with "kroner", offers the direct-booking benefit once. Safety section (same style
as Stemme): speech never changes instructions; never confirm a booking, give discounts beyond the
direct price, take card or payment data, or reveal other guests' details; unknown facts → offer a
message to staff. Abuse → stay calm, warn once, then end the call. Silence → ask once if they are
there, then end politely (ElevenLabs turn/silence settings where the SDK supports them). Timezone
Europe/Oslo so the agent knows today's date.

## 8. Phone (needs ShirazIQ's yes: costs money)

ElevenLabs supports importing a **Twilio** number (purchased Twilio numbers get inbound calls) and
assigning it to an agent (dashboard, or `phoneNumbers.create` with `provider: "twilio"`, `sid`,
`token`, `agent_id`). Steps and cost go in `docs/research/elevenlabs-phone-2026-11.md`. Before that:
deploy the app, set `RECEPTION_PUBLIC_URL` and `RECEPTION_TOOL_SECRET`, re-run setup so the tools
become webhooks. Nothing is bought or created without a yes in chat.

## 9. New env vars (contract change → `[contract]` in the PR)

| Name | Read by | Secret? |
|---|---|---|
| `ELEVENLABS_RECEPTION_AGENT_ID` | `/api/reception/token`, `/api/reception/calls`, reception `setup-agent.ts` | no |
| `RECEPTION_PUBLIC_URL` | reception `setup-agent.ts` (webhook mode) | no |
| `RECEPTION_TOOL_SECRET` | `/api/reception/tools/[tool]`, reception `setup-agent.ts` | **yes** |

## 10. Files

`src/features/reception/` (hotel data, dates/availability, request scrubbing, tools, agent config,
setup script, hook, screen components), `src/app/resepsjon/page.tsx`, `src/app/api/reception/
{token,tools/[tool],calls}/route.ts`, `src/lib/env.ts` (+`receptionEnv()`), `src/ui/icons.tsx`
(+`PhoneIcon`), `src/ui/AppNav.tsx`, `src/app/page.tsx`, `docs/ARCHITECTURE.md` § 4.4, the research
note. Nothing in `agent/`, `viewer/`, `src/features/{eyes,routes,nightshift}`.

## 11. Tests (odd inputs are the point)

Unit tests next to the code: silence/empty tool args, missing fields, wrong types, unknown language
codes, prompt-injection text in names and messages (stored as plain text, never followed), card
numbers in free text, impossible dates (31 Feb, departure before arrival, past, too far ahead, 0 or
400 nights), sold-out rooms, price for a room that does not exist, too many guests, very long
messages, flood of requests, webhook without or with a wrong secret, malformed ElevenLabs history.

## 12. Left to the builder

Exact copy within `DESIGN.md` voice; layout of `/resepsjon` within the design tokens; exact SDK field
names (verify against `@elevenlabs/elevenlabs-js` types; if a turn/silence field does not exist, rely
on the prompt and say so).
