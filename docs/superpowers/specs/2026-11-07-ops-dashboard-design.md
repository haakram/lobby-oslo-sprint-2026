# Drift: the 06:00 handover dashboard — design

**Owners:** ShirazIQ builds it in the Lobby app (Track B) and owns the demo (Track C); Hamad adds
two small things on the agent side (Track A). **Date:** 2026-11-07. **Status:** approved by the team
lead to plan and build ("ja det kan du gjøre … planlegge det godt slik at vi kan vise alt det på kun
2 min og at det løser et reelt problem i demoen"). The calls below are Claude's and can be checked.
Builds on `2026-11-07-lobby-app-design.md` (ShirazIQ's Track B design) and the agent's run log v1.

## The real problem, in one sentence

Every morning a hotel loses money in three quiet ways: **rooms that are clean but not marked ready**
(guests wait, early check-in isn't sold), **linen and towels that disappear** (15–20 % lost before
they're worn out) and **faults found too late** (noise, leaks, a broken AC that first show up as a
one-star review). Lobby works the night, and at 06:00 the manager sees all of it on one screen and
acts on it in a minute.

## The 2-minute demo (one story, five beats)

The pitch is 2 min + 1 min questions. Every beat solves a named problem, uses something we built, and
maps to a prize. Times are targets; rehearse against a timer.

| Time | Beat | On screen | Problem it solves | Prize hook |
|---|---|---|---|---|
| 0:00–0:15 | **Hook** | Three numbers, one per problem | — | Main prize: a real business problem |
| 0:15–0:50 | **Natten** (the night) | **Drift** screen: the hotel's room grid lights up as the night replays (rooms turn *Klar* when the robot's room check passes, *Ikke forstyrr* where it respected a DND sign); work orders appear as the robot finds them (*Støy rom 201*, *Søl 3. etasje*); score and clock from the real shift | Rooms not marked ready; faults found late | **Wybe** (the agent's real night, its score) |
| 0:50–1:10 | **Send renholderne** | One tap: the rooms that still need cleaning become a route in the best order across floors: *"212 m spart · 38 % kortere"* | Cleaners walk in the wrong order, rooms ready late | **Holio 6** |
| 1:10–1:30 | **Lintelling** | Phone camera at the linen shelf: boxes on the towels, *"9 håndklær · forventet 12 · 3 mangler"*, a work order appears on Drift | Linen disappears, counting is manual and rare | **Holio 7** + eyes without barcodes (**Holio 3**) |
| 1:30–1:50 | **Gjesten sier fra** | A guest speaks Spanish into the robot: *"the AC in 204 doesn't work"*. Lobby answers in Spanish, asks *"Is everything else all right with the room?"*, and a work order *AC defekt · rom 204 · via stemme* lands on Drift. A cleaner then asks in Polish what to do first and hears the answer in Polish | Complaints caught while the guest is still here; training in your own language | **ElevenLabs** + **Holio 9** |
| 1:50–2:00 | **Close** | Drift, all green except the three work orders: *"Én hjerne. Øyne, ruter og stemme. Færre tomme rom, færre tapte håndklær, feil rettet før anmeldelsen."* | — | All |

What we **don't** show in the 2 minutes (they exist, the jury can ask): product identification by
itself, the 3D viewer, the night-shift details, the plukkliste flow.

## What the Drift screen is

One new route in the app, **`/drift`**, the manager's 06:00 view. Light working screen, the app's
design tokens only (`DESIGN.md`), Norwegian copy.

1. **Romstatus** (the hero): every room on its floor (1, 2, 3) as a tile. States: *Klar* (green),
   *Må vaskes* (neutral), *Opptatt* (blue-grey), *Ikke forstyrr* (amber outline), *Avvik* (red dot =
   an open work order). Tap a tile → its history from the night.
2. **Arbeidsordre**: a feed, newest first. Each: room or place, type (støy, søl, teknisk, lin,
   gjesteklage), source (robot · stemme · kamera), time, status (*Ny · Tildelt · Løst*). One tap to
   assign or close.
3. **Lin og håndklær**: expected vs counted per item, the deviation in red, *"Tell på nytt"* opens the
   camera.
4. **Send renholderne**: the rooms in *Må vaskes* → the existing route screen's tour engine, drawn on
   the floor map with the saved distance.
5. A thin strip: the robot's score, sim clock and *Åpne 3D*.

## Where the data comes from

| Panel | Source | Owner |
|---|---|---|
| Room status, robot work orders, score | The agent's run log v1, plus two new decision kinds (below) | Track A emits, Track B reads |
| Voice work orders | ElevenLabs client tool `create_work_order` → the app's work-order store | Track B |
| Linen count | `POST /api/count-linen`: Claude vision counts towels, sheets and pillowcases in one photo, compared with the expected stock (test data) | Track B |
| Cleaning route | The existing tour engine over Track A's route matrix (`npm run routes`) | Track B, Track A's router |

**Run log additions (Track A, additive, `[contract]`):** two decision kinds.

- `room_status`: `{"room": "room-206", "status": "klar" | "opptatt" | "ikke_forstyrr" | "ma_vaskes", "source": "room_check" | "knock" | "door_sign", "note": "<what the robot saw>"}`, logged whenever the robot learns a room's state (room check look, knock answer, DND sign).
- `work_order`: `{"room": "room-201" | null, "place": "corridor-3a" | null, "type": "stoy" | "sol" | "teknisk" | "gjesteklage" | "annet", "text": "<short Norwegian description>", "request": "R-025" | null}`, logged when the robot handles or finds a fault (noise complaint, spill, a follow-up complaint, a room-check finding that isn't "tidy").

The app treats unknown kinds as before (ignored), so old logs still replay.

**Viewer CORS (Track A):** `agent/viewer_server.py` adds `Access-Control-Allow-Origin` for the app's
local origin only (`http://localhost:3000`, configurable), on the `/api/*` routes, so Drift and the
night-shift screen can follow a live shift. Nothing else changes; the server still binds 127.0.0.1.

## The new voice and camera pieces (Track B)

- **`create_work_order({room, type, description, language})`**: an allowlisted client tool, arguments
  validated with zod. It *proposes* a work order; the screen shows it with *Bekreft* (consistent with
  the "voice only proposes" anti-goal). In the demo, one tap.
- The agent's prompt gains the guest check: after a complaint, ask once *"Is everything else all right
  with the room?"* in the guest's language; one more issue → one more proposed work order.
- **Linen count**: the existing camera and crop code; a new route handler `POST /api/count-linen`
  sends one downscaled photo (≤ 768 px) to Claude with strict JSON output `{towels, sheets,
  pillowcases, confidence, notes}`, metered against `APP_CLAUDE_BUDGET_USD`. The expected stock is
  test data (`src/features/linen/expected.ts`). A deviation ≥ 1 creates a proposed work order of type
  *lin*. Present the count as an estimate with a confidence badge, never as an exact audit.

## Goals, non-goals, anti-goals

- **Goals:** the 2-minute story runs end to end on the deployed URL from the real practice log;
  every beat shows a real problem being solved; one screen, readable from the back of the room.
- **Non-goals:** a real PMS/hotel system integration, logins, persistence beyond the demo session
  (`localStorage` is enough), editing the agent.
- **Anti-goals:** a fourth and fifth separate demo flow (it must stay one story); numbers on the slide
  without a source; a voice command that changes anything without a tap; real guest data.

## Real-world claims (verify before the pitch)

The hook's numbers come from the team's slides: *"15–20 % of linen lost or thrown away before worn
out"* and *"88 % of hotel staff had seen towels disappear (Hotel Management Network)"*. Find and link
the sources (Track C task) or soften the wording ("around one in six"). The jury has a lawyer and a
marketer.

## Priorities

- **Must:** Drift room grid + work-order feed from the run log; *Send renholderne* on the existing
  tour engine; the voice `create_work_order` tool with the guest check; the 2-minute script in
  `docs/DEMO.md`; the demo log from the agent's next practice run.
- **Should:** linen count with the camera; tile history; live mode through the viewer.
- **Could:** the cleaner's Polish question (falls back to the existing voice demo if time runs out).

## Left to the builders

Component APIs, tile layout per floor, exact copy, the vision prompt wording, the order the panels
stack on a phone.
