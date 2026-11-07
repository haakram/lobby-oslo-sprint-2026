# Fettero app — design (Track B)

**Owner:** ShirazIQ · **Date:** 2026-11-07 · **Status:** draft for Hamad's OK. ShirazIQ skipped the
design questions ("just start") and asked for one thing above all: **it must look and feel
professional: font, colours, the solution, the copy, the animations.** Everything else below is
Claude's call, listed so it can be checked.

## Intent

The robot's **eyes, routes and voice**, in one app a new warehouse or hotel worker holds in their
hand. It solves Holio pains **3** (no barcode), **6** (long walks) and **9** (training in your own
language), wins the ElevenLabs prize by making voice the way you talk to the robot, and shows Track
A's Night Shift agent at work, so A and B pitch as one product: **Fettero, the robot co-worker.**

The judges see it for two minutes. Every choice is weighed against that demo.

## The demo story (2 minutes)

1. **Eyes.** A shampoo bottle with its barcode taped over goes in front of the phone camera. Boxes
   follow objects live. Tap the box: in about two seconds the card reads *"Sjampo 250 ml · SKU
   FT-1042 · Lager B, hylle 3"*, with the text Claude read off the pack.
2. **Routes.** Tap *"Legg i plukkliste"* on two more products, then *"Beste rute"*. The map draws the
   shortest route across floors, stop by stop, and says how much shorter it is than walking the list
   in order (*"212 m spart · 38 % kortere"*).
3. **Voice.** A new worker presses the mic and asks in Polish where the soap goes. Fettero answers
   out loud in Polish and the screen shows the product and its route. Switch to English or
   Norwegian mid-sentence and it follows.
4. **Night shift.** One screen shows the robot's own shift from Track A's run log: score, clock,
   tasks done, the decisions it made, and a link to the 3D viewer.

## Goals

1. Live camera with boxes and labels, smooth on a mid-range phone; tap a box (or the shutter if
   nothing is boxed) to identify the product from the image and the text on the pack, no barcode.
2. Shortest multi-stop route across floors, drawn on a clean 2D floor map, with the distance saved
   against walking the stops in list order.
3. Voice conversation in the speaker's own language that can show a product, show a route and explain
   a work step, through allowlisted app actions.
4. A replay (and, when run locally, the live view) of the agent's shift from run log v1.
5. **Looks like a product, not a hackathon**: one type family, a real colour system, consistent
   spacing, purposeful motion, Norwegian copy written for a warehouse floor.

## Non-goals

- Real Holio integration, real stock data, logins or user accounts (a seeded demo worker).
- Barcode scanning (the point is working *without* one).
- Rebuilding anything Track A owns: routing, the hotel map, the 3D viewer, the run log format.
- Training our own vision model.
- A UI language switcher. The UI is Norwegian bokmål; the **voice** speaks any language.

## Anti-goals (failure even if it "works")

- An API key reaching the browser, a log, a screenshot or git.
- A voice command doing something with effect (e.g. queuing a robot task) without a tap to confirm.
- Claude spend that isn't counted, or that can run past the app's share of the USD 30 cap.
- Real customer or guest data anywhere (Holio rule: test data only).
- Template look: default fonts, purple gradients, emoji icons, inconsistent radii, spinners where a
  skeleton belongs.
- Motion that slows the demo down or ignores `prefers-reduced-motion`.

## Constraints

- **Stack (Claude's call):** Next.js (App Router) + TypeScript `strict`, npm, Tailwind CSS v4 for
  styling, `motion` for animation, `zod` at every boundary, Vitest for unit tests, Playwright for
  screenshots. Deployed on **Vercel** (HTTPS, needed for the phone camera). The Next app sits at the
  repo root (`package.json`, `src/`) so `scripts/check.sh` runs its lint, typecheck, test and build.
- **Keys stay on the server.** `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` are read only in route
  handlers. The browser gets a short-lived ElevenLabs conversation token from `/api/voice/token`.
  ShirazIQ adds the keys to Vercel in its dashboard; Claude never types a key anywhere.
- **Claude budget:** the app's share is **USD 5** of the team's 30 (`APP_CLAUDE_BUDGET_USD`, new,
  default 5). Every call is metered from the token counts in the reply and refused once the share is
  spent. On Vercel the counter is per server instance, so the Anthropic Console limit stays the hard
  stop; the plan picks the model and price with the `claude-api` skill. The ElevenLabs agent's LLM is
  billed by ElevenLabs, not by us.
- **Speech is untrusted input.** Voice tools only show things (a product, a route, a guide step). The
  one tool with effect, `queue_robot_task`, only *proposes*; a person taps *Bekreft*.
- **Test data only.** Made-up products and SKUs; the props are bought in a shop.
- **Never run the app or generate speech for the first time without ShirazIQ's yes.** Before writing
  ElevenLabs code, run `npx -y @elevenlabs/cli@latest onboard check --answered --env-path .env` and
  follow what it prints.
- **Stay in Track B files.** Never edit `agent/` or `viewer/`; ask Hamad.

## Shape

```
package.json · next.config.ts · tsconfig.json · eslint.config.mjs · vitest.config.ts
src/
  app/                      routes: / (home) · /oyne · /ruter · /stemme · /natteskift
    api/identify/route.ts   image → product card (Claude vision, metered)
    api/voice/token/route.ts  ElevenLabs conversation token
  features/
    eyes/        camera, live detector, boxes overlay, identify card
    catalog/     test products: SKU, name, category, location node   (test data)
    routes/      floor map (SVG), tour ordering, saved-distance maths, route data
    voice/       ElevenLabs session, client tools, transcript, agent setup script
    nightshift/  run log v1 parser + replay
  ui/            design-system components (Button, Card, Sheet, Badge, Stat, Skeleton …)
  lib/           env (server-only), spend meter, zod helpers
public/models/   the detector model file, self-hosted (venue wifi)
public/runs/     a sample run log for the deployed replay
tests/app/       Playwright smoke + screenshot script (unit tests sit next to the code)
```

## The parts

### Eyes (Holio 3)

- **Live boxes in the browser** with MediaPipe's object detector (`@mediapipe/tasks-vision`,
  EfficientDet-Lite0), model file in `public/models/` so it doesn't depend on the venue's wifi to a
  CDN. Generic classes (bottle, cup, box …) are fine: the box only says *where*; the label reads
  *"Ukjent produkt · trykk"* until identified.
- **Tap → identify.** The tapped crop (or the whole frame from the shutter), downscaled to ≤ 768 px
  JPEG, goes to `POST /api/identify`. Claude gets the image and the catalogue (name, SKU, category,
  short description) and returns strict JSON: `{ sku | null, name, category, text_seen[],
  confidence }`, validated with zod. No match → *"Ikke i katalogen"* with what it read.
- The card: product name, SKU, location, the text read off the pack, a confidence badge, and two
  actions: *Vis vei* and *Legg i plukkliste*.

### Routes (Holio 6)

- **Track A's router is the only router.** A Track B script imports `agent.world.Hotel` and
  `agent.routing.shortest_route` and writes, for every pair of nodes the app uses, the metres, the
  seconds and the node path to `src/features/routes/data/<map>.routes.json` (`npm run routes`). The
  app does only the ordering in TypeScript: exact permutations over that matrix for ≤ 7 stops.
- **Map:** the hotel map (`agent/data/hotel_seed1.json`) first, since it exists and ties to the
  robot. A small warehouse test map in the same format is a *should*, for Holio's eyes.
- **Until `agent/` lands on `main`:** a hand-made route file for a few stops, marked
  `TODO(phase-2): replace with npm run routes`.
- The screen: one clean 2D plan per floor with floor tabs, stops numbered, the route drawn
  as an animated line, lifts and stairs marked, and a stat row: total metres, saved metres, saved %.

### Voice (Holio 9 + ElevenLabs)

- A **hosted ElevenLabs agent** with Claude as its LLM (the research's option A), created once by a
  script in `src/features/voice/` that stores its id in `ELEVENLABS_AGENT_ID` (new, not secret).
- System tool `language_detection` on, multilingual voice; the agent answers in the speaker's
  language. Its prompt knows the catalogue and four short work guides (receiving, picking, packing,
  returns), so it can train a new worker.
- **Client tools** (registered in the browser, all allowlisted, arguments validated with zod):
  `show_product(sku)`, `show_route(skus[])`, `show_guide(step)`, `queue_robot_task(text)` (opens a
  confirm sheet; nothing happens without the tap).
- The screen: a large voice orb that reacts to input and output levels, a live transcript with the
  detected language as a badge, and the card or route the agent asked to show.

### Night shift (Track A in the app)

- Parses run log v1 (`ARCHITECTURE.md` § 4.3) with a zod schema; unknown line types are ignored.
- Deployed: replays `public/runs/demo.jsonl` (a real practice run Hamad hands over). Locally: reads
  the viewer server's `/api/runs` and `/api/run/<shift>` at `127.0.0.1:8765` for a live shift.
- Shows score, sim clock, tasks done and failed, the latest decisions as a feed, and *Åpne 3D* to the
  viewer.

## Look and feel (the bar ShirazIQ set)

The `frontend-design` skill sets the final values and writes them into `DESIGN.md` (tokens, type
scale, components) before any screen is built; every screen uses only those tokens. Direction:

- **Character:** a calm, precise work tool you trust at 06:00 on a warehouse floor. Industrial, not
  playful.
- **Type:** one grotesque sans for UI and headings, a monospace for SKUs, metres and the clock.
  Self-hosted with `next/font`. Not the framework default.
- **Colour:** dark camera and night-shift screens, light working screens; one signal accent (safety
  orange family) for the single main action per screen; green, amber and red only for states. Body
  text ≥ 4.5:1 contrast.
- **Motion:** boxes ease to their target instead of jumping; the route line draws itself stop by
  stop; cards rise in as sheets; the voice orb breathes with the audio level. 150–300 ms, no bounce,
  all off under `prefers-reduced-motion`.
- **Copy:** short Norwegian bokmål, verbs on buttons (*Identifiser*, *Vis vei*, *Bekreft*), errors
  that say what happened and what to do next. No emoji.
- **States:** every screen that loads has a skeleton, an empty state and an error state; camera and
  microphone permission denials get their own clear screens.

## Priorities

- **Must:** design system and app shell · Eyes (boxes + identify + card) · Routes on the hotel map ·
  Voice with `show_product` and `show_route` and language detection · deployed URL.
- **Should:** Night-shift replay · `show_guide` and `queue_robot_task` · warehouse test map ·
  identify → plukkliste → route as one flow.
- **Could:** live night-shift view from the local viewer server · offline fallback video.

## Contracts this touches

- **Reads** run log v1 and `agent/data/hotel_seed1.json`; imports `agent.world` and `agent.routing`
  in the export script. No change to them.
- **Adds env vars** `ELEVENLABS_AGENT_ID` and `APP_CLAUDE_BUDGET_USD`: the build PR that first reads
  them is a `[contract]` PR and updates `.env.example` and `ARCHITECTURE.md` § 4.4. It also fills
  `ARCHITECTURE.md` § 1 and § 3 for Track B, and `DESIGN.md`.

## Left to the builders

Exact component APIs, the detector's score threshold and smoothing, the identify prompt wording, the
map's drawing coordinates, test file layout, the ElevenLabs voice choice (one calm voice, ShirazIQ
hears it before the demo).

## Open questions

- Does Holio count three pains in one flow for or against us? (Team review list; ask at the panel.)
- Does Track A's router accept a non-hotel map (the warehouse *should*), or only the hotel's node
  kinds? Ask Hamad when `agent/` lands.
- Vercel account: ShirazIQ's or Hamad's? Deploying and adding keys there needs its owner.
