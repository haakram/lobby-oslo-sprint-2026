# DEMO.md — Demo, pitch and submission

> What the jury sees. Owners: ShirazIQ (script, deck, presenting), Hamad (agent numbers, Q&A on tech,
> security and privacy). Written Sat 7 Nov night from what is built on `hamad/lobby-v2` (app) and
> `hamad/final` (agent); every claim below is checked against the code, a run log or a cited source.
> Keep § 2 in sync with `docs/PRD.md` § 4. Rehearse against a timer, twice, on a laptop that isn't the
> builder's.

## 1. The pitch in one breath

**Lobby gives the hotel's 06:00 handover manager the whole night on one screen: which rooms can be
sold, which guest is still waiting, what broke, and what the night robot did, so the day shift starts
with what needs a person now, in the shortest order.** It works because the robot is ours: an AI agent
that ran Wybe's live hotel simulation on its own (best practice night 2,695 points, every "done" it
reported credited by the server), and the same run log draws the rooms, the routes and the 3D map.

Why it matters (sourced, use one or two on the hook slide, never all):

| Figure | Source |
|---|---|
| Norwegian hotels sold **26.7 million guest nights** in 2024 (19.1 M by Norwegians, 7.6 M by foreign guests), a record year; foreign hotel nights grew **14 %**. More guests who don't speak Norwegian. | SSB, ["2024 ble det beste året nokon gong for norske overnattingsstader"](https://www.ssb.no/transport-og-reiseliv/reiseliv/statistikk/overnattingar/artikler/2024-ble-det-beste-aret-nokon-gong-for-norske-overnattingsstader), 4 Feb 2025 |
| Even in a normal year, **under 11 %** of the people who had worked in Norwegian accommodation and food service every month from Nov 2018 to Feb 2019 had left the industry by **June 2019** (8,400 people in four months). About **40 %** of the stable workforce works part-time. The person reading the handover is often new. | SSB analyse 2023/9, ["Mange vendte ikke tilbake til overnatting og servering etter koronapandemien"](https://www.ssb.no/arbeid-og-lonn/sysselsetting/artikler/mange-vendte-ikke-tilbake-til-overnatting-og-servering-etter-koronapandemien), 6 Nov 2023 |
| Hotels "can lose or discard around **15 % to 20 %** of linen products before the end of their useful life" (TRSA research, cited); **88 %** of 1,239 hotel staff and owners had seen towels disappear or heard of them being stolen. The same article says there is no reliable global benchmark for what guests take, so say "up to one in five", not a fact about every hotel. | Hotel Management Network, ["When guests take towels, robes and more"](https://www.hotelmanagement-network.com/features/when-guests-take-towels-robes-and-more-how-hotels-can-tackle-inventory-shrinkage/), 25 Aug 2026 (the 88 % is a survey by Deluxe Holiday Homes, Jan 2026) |
| In warehouse picking, "travel time can account for **50 % or more** of total order picking time" (Holio pain 6, for the Holio slide only). | Supply Chain Digest, [Cliff Holste, "Routing & Slotting Strategy"](https://www.scdigest.com/experts/Holste_14-03-12.php?cid=7902), 12 Mar 2014 |

Not sourced, so **not said**: anything about what hotels do today at 06:00 (we have talked to no
hotel), any saving in minutes or money from Lobby, any customer or pilot.

## 2. Demo script (2:00, then 1 minute of questions)

One user: **the night manager handing over to the day shift at 06:00.** One story: the night is over,
what needs a person now. Live on the deployed URL, logged in as `hamad` (admin) before going on stage,
browser at 1440 px, Oversikt open. The data is a real live practice night of our agent (seed 5,
2,212 points, `public/runs/demo.jsonl`) plus test data marked as such on screen.

| Time | Screen / action | What the presenter says | Criterion it serves |
|---|---|---|---|
| 0:00–0:15 | **Oversikt** already open. Point at the dark top bar: *Natt til søndag 8. november · overlevering 06:00*, the robot chip *Lavt batteri 13 %*. | "06:00 in a 36-room hotel. The night manager hands over. Overnight a robot did the errands. Which rooms can be sold, who is still waiting, what broke? In Norway, even in a normal year, one in ten hotel and restaurant workers leaves the industry within four months: whoever reads this handover is often new." | A real problem |
| 0:15–0:40 | Sweep down the **Nå** band, then the eight figures (*Belegg i natt, Klare til salg, Må vaskes, Åpne arbeidsordre …*). | "Lobby answers in one screen. Loudest first: twelve requests waiting, nine the robot couldn't finish; six urgent work orders; three rooms to clean; two arrivals with no room. Each row has one action. Red, amber and green always come with a word." | Design (understandable without explaining) |
| 0:40–1:00 | Tap the orange **Lag renholdsrute** → **Ruter** opens with rooms 201, 206 and 327: *194 m · ca. 7 min for 3 rom*, the route drawn across floors, *Med vogn: heis, ikke trapp* on. | "One tap: the shortest cleaning round across three floors. With the cart it takes the lift, never the stairs. It's the same router our robot uses, ported from its Python code and checked against it in tests." | Functionality · Innovation · Holio pain 6 |
| 1:00–1:20 | Back. **Forespørsler** → *Roboten fikk det ikke til* → on *«Ms Lindqvist would like two towels.»* (*Feilet*) tap **Ta over**; the status line with *Angre* appears. | "What the robot couldn't do, it says so, with the guest's own words. It never reports 'done' when it isn't. The towels were out of stock; a person takes it over, one tap, and can undo." | Functionality · A real problem |
| 1:20–1:50 | **3D-kart**: press **Spill av fra 22:00** at 600×, the orange robot walks the floors; drag the timeline to 06:00. Then **Natteskift**: *68 Oppgaver fullført · 10 feilet · 2212 Poeng*. | "And this is the robot's night. Not an animation: our agent played Wybe's live hotel simulation on its own, every move logged. Our best night: 2,695 points; 74 'done' reports, 74 credited by Wybe's server, one penalty all night, a slip on a wet floor." **If the Wybe final result is out (13:05), say it here instead.** | Innovation · Functionality · Team efficiency |
| 1:50–2:00 | Back to **Oversikt**. | "Lobby: the whole hotel at 06:00, with a robot that works the night and tells the truth about it. Inside too: a camera that knows products without a barcode, and an AI receptionist that answers the phone in the guest's language." | All five; points to the Q&A |

Rules for the presenter: don't explain the navigation; don't open Øyne, Stemme or Resepsjon in the 2
minutes (they need a camera, a microphone and the network, and they are the Q&A answers); if a screen
stalls for 3 seconds, say the line and move on.

## 3. Pitch outline for the final (5–10 min, top 10 at 18:00)

Each juror scores from their own field (CONTEXT § 11). Every part names the field it answers.

1. **Problem (1 min; Real problem, Domain, Marketing).** The 06:00 handover in a 40–150 room hotel:
   rooms not released, guests waiting, faults found late, linen gone, staff new and multilingual.
   Two sourced figures from § 1 (SSB turnover, SSB guest nights). Say plainly: we have not yet
   interviewed a hotel; this is the pain as we read it, and the next step is to test it.
2. **Live demo (3–4 min; Functionality, Design).** The § 2 story, then the extras the 2 minutes skip:
   - **Robotens øyne** (Holio pain 3): point the phone at a shelf; boxes appear at once (MediaPipe on
     the device, nothing sent); tap a product, Claude reads the pack and matches the catalogue; *Vis
     vei* opens its route. People are never cropped and sent.
   - **Resepsjon** (ElevenLabs): *Ring resepsjonen*, ask in English or Polish for a room next weekend;
     it quotes the direct price, haggles in fixed steps (at most 10 % under), records a booking
     request that waits for *Bekreft*; it never takes a card number and says it is an AI.
   - **Rom og renhold**, one tile: the room's night from the run log.
3. **How it works (1 slide, 1 min; IT and security, Innovation).**
   `Wybe simulation ⇄ our agent (Python: exact sim-time router, value-per-second planner, safety
   gates, "done" only after the server's score rises)` → `run log (JSONL)` → `Lobby (Next.js 16)`:
   Oversikt, Rom, Ruter, Natteskift, 3D-kart all read the same log. Beside it: camera → MediaPipe
   on device → Claude (product ID, server-side key, spend cap); voice → ElevenLabs agents with
   Claude as the LLM, short-lived tokens from our server. Login with three roles, enforced on the
   server. 759 app tests, 743 agent tests, CI with a secret scan.
4. **Business (1–2 min; Founders, Marketing).** All three numbers are **proposals for the team to
   decide**, not facts:
   - **One buyer:** the operations or front-office manager of an independent or small-chain hotel of
     40–150 rooms in Norway.
   - **One price:** TBD by the team (the mock jury suggested about NOK 25 per room per month).
   - **One next step:** a 4-week pilot at one Oslo hotel, software only (no robot): Oversikt, Ruter
     and the AI receptionist on their own data, measured on time from 06:00 to the first room
     released. The robot is phase 2; Wybe-style robots plug in through the run log.
5. **Team (20 s; Team efficiency).** Hamad (agent, Lobby, tooling) and ShirazIQ (UI, voice,
   receptionist, demo). Two people, 48 hours, subagent-driven development, every change reviewed,
   tests and CI on every PR.

## 4. Backup plan

- **Recorded demo video:** TBD (record the § 2 script once the new look is deployed; keep it on two
  laptops and offline). Path: TBD.
- **Deployed URL down:** run the production build locally from the repo:
  `npm ci && npm run build && npm start`, then http://localhost:3000. Needs `.env.local` with
  `LOBBY_AUTH_SECRET` and `LOBBY_USERS` (login), `ANTHROPIC_API_KEY` (Øyne) and
  `ELEVENLABS_API_KEY` + agent ids (voice). Build it Sunday morning, before the venue wifi fills up.
- **Venue wifi down:** the local build (built beforehand: `next/font` fetches the fonts at build
  time). Everything in the § 2 script then runs without a network: Oversikt, Ruter, Forespørsler,
  3D-kart and Natteskift read the recorded night
  (`public/runs/demo.jsonl`, seed 5, 2,212 points) and test data shipped with the app. Øyne's boxes
  work offline (model files in `public/models`, `public/mediapipe`); product ID and voice need the
  network.
- **The recorded run log:** `public/runs/demo.jsonl` (live practice night, seed 5). The best night's
  log (seed 10, 2,695) is on Hamad's machine (`oslo-wt/wave/temp/runs/w2-35b0831e8a80fc176a9a4c5293caab87.jsonl`);
  the Wybe final's logs land in `temp/runs/` at 13:00.
- **Live mode (*Direkte*):** only with the agent's viewer running on the same laptop
  (`.venv/bin/python -m agent viewer`); never needed for the demo.

## 5. Submission checklist (CONTEXT § 2 and § 11; deadline Sun 14:00, repos lock at the last commit)

- [ ] Agent code merged to `main` (CONTEXT § 11: "the agent code must be on `main`").
- [ ] Lobby v2 merged to `main` and deployed; the deployed URL shows the new look.
- [ ] Repo access for the jury: public, or the jury added (team lead's decision, CONTEXT § 11).
- [ ] `README.md` first screen: what it is, the URL, the login, three things to click, how to run.
- [ ] `docs/DEMO.md`, `docs/PRD.md` (reviewed by both), `docs/PRIVACY.md` on `main`.
- [ ] `/lever` typed in #general with team, repo, demo link and one-line description;
      `/min-innlevering` checked; `/lever` again after any change.
- [ ] All files committed and pushed before 14:00, with a 15-minute buffer. Nothing merged in the
      last hour unless the presenter agrees.
- [ ] Recorded demo video on two laptops (§ 4).
- [ ] API credit left on Anthropic and ElevenLabs; the demo login tested in a private window, on a
      phone and on a second laptop.

## 6. Likely judge questions

Short, honest answers. "Who" is a proposal; swap freely.

| Field | Question | Answer | Who |
|---|---|---|---|
| Functionality | Is this live or hard-coded? | Live app on a public URL with login. The night on screen is a real practice night our agent played against Wybe's server; the rooms, routes and 3D map are computed from its log. Guests, staff and stock are test data, and the screen says so under every list. | ShirazIQ |
| Real problem | Who has this problem? | The manager who takes over a hotel at 06:00. We haven't interviewed one yet; the next step is a pilot. The sourced part: in a normal year one in ten hotel and restaurant workers in Norway left the industry within four months (SSB), and foreign hotel nights grew 14 % in 2024 (SSB). | Hamad |
| Innovation | What does your agent do that a prompt plus tools wouldn't? | It plans on exact simulation time (routes in seconds, elevators, cart rules), never says "done" until the server's score rises, treats unknown requests as logged hypotheses, and refuses unsafe moves in code (no keycard for a stranger who says "let me in", no trip to a room with a Do-Not-Disturb sign). Best night 2,695; every "done" credited. Its Claude spend all weekend: about USD 0.001, because plain code did the work. | Hamad |
| Design | Did you test it with users? | Not with hotel staff. Every screen went through automated UX audits at phone and desktop width and a fix round. If we run hallway tests Sunday morning, quote the real numbers here; otherwise say "not yet". | ShirazIQ |
| Team efficiency | What would you cut first? | Already cut: linen counting by camera, voice-to-work-order, a separate Drift screen, translation between guest and staff. Kept: one handover story that runs end to end. | ShirazIQ |
| Founders | Can this be a company? Next step if you win? | The software is sellable without a robot: handover screen, cleaning routes, AI receptionist. Next step: one Oslo hotel, four weeks, measured on time to first room released. Price and buyer are hypotheses we haven't tested. | Hamad |
| IT and security | Biggest technical risk? | Two. Sim-to-real: the robot is a simulation; real lifts, doors and a PMS are integration work we haven't done. And untrusted text: guests' words reach an agent, so the safety rules live in code outside the model. Paid endpoints need a login and the right role; keys stay on the server. Gap we know: the Claude spend cap is per server instance and the paid routes have no per-IP rate limit (`docs/PRIVACY.md` § 6). | Hamad |
| Product | What did you leave out, and why? | PMS integration (test data, marked), a database (records live in the browser), payments, real robot hardware, camera linen counts, voice work orders, guest-staff translation, multi-hotel. They don't change what the manager decides at 06:00. Full list: `docs/PRD.md` § 6. | Hamad |
| Marketing | How do you get the first 100 users? | Honest: no channel tested. Plan to test: direct visits to Oslo hotel duty managers with the pilot offer, then the hotel industry association (NHO Reiseliv) and hotel groups once one pilot has a number. No users or waitlist today. | ShirazIQ |
| Creative and design | Why this look? | A calm operations tool for 06:00: one grotesk and one mono, light working screens, night steel for the robot's world, one orange action per screen, states always in words (`DESIGN.md`). | ShirazIQ |
| Law | What about privacy, cameras and guests' voices? | No real personal data in the demo. Camera frames are never stored by us; people are never cropped and sent, but whole-frame scans can contain them, so a pilot turns those off or blurs faces. The receptionist keeps transcripts 30 days and no audio, collects only what a booking needs, never card numbers. Claude and ElevenLabs process outside the EEA: a pilot needs DPAs, a transfer basis and a DPIA, with the hotel as controller. `docs/PRIVACY.md`. | Hamad |
| Domain | Why hasn't anyone solved this? | Hotel software and delivery robots both exist; what's missing is the layer between them: a robot that handles requests it was never scripted for, says honestly what it couldn't do, and one screen where its night and the staff's work meet. Cheap, capable language models made that agent buildable in a weekend. Honest caveat: on real hardware it is still unproven. | Hamad |
| Domain (Holio) | Which Holio pains? | 3: Øyne recognises products from the pack, no barcode. 6: Ruter's shortest route across floors (hotel cleaning round, robot walk, pick list). 9: Snakk gjennom roboten answers staff in their language; translating guest to staff is the next step, not built. | ShirazIQ |
| Domain (Wybe) | How did the agent do? | Best practice night 2,695 (seed 10); fixes validated live last night: per-request manager answers +177 on seed 23, visible lost items +297 on seed 41. Final result: say it after 13:05. | Hamad |
