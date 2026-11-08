# DEMO.md — Demo, pitch and submission

> What the jury sees. Owners: ShirazIQ (script, deck, presenting), Hamad (agent numbers, Q&A on tech,
> security and privacy). Rewritten Sun 8 Nov morning against the screens on `hamad/jury-loop` (app,
> running on :3300) and the final agent on `hamad/final`. Every claim below is checked against the
> code, a run log or a cited source; anything not yet true is marked **[fill]** or **[if]**. Keep § 2
> in sync with `docs/PRD.md` § 4. Rehearse against a timer, twice, on a laptop that isn't the builder's.
> The product trades as **Fettero** on this branch (the team lead decides whether `main` follows);
> *Hotell Nattskift* is only the demo hotel's name.

## 1. The pitch in one breath

**Fettero is the night shift that reports back. At 06:00 the manager who takes over the hotel gets
the night on one page: which rooms can be sold today and for how much, what is still open and who
owns it, and what the night robot did and refused to do. Nothing on it says "done" unless it was
confirmed.** It works because the robot is ours: an AI agent that ran Wybe's live hotel simulation
on its own. On the night in the demo it reported "done" 73 times, and the referee in Wybe's simulation
credited all 73; over its last 14 live nights, 973 of 976.

The one line, as on the login screen and the first slide: ***Natten, ærlig overlevert.*** (the night,
handed over honestly). One sentence after it: *Roboten tar natten, og morgenvakten får hele hotellet på
én side kl. 06:00.*

Why it matters (sourced; use one or two on the hook slide, never all):

| Figure | Source |
|---|---|
| Even in a normal year, **under 11 %** of the people who had worked in Norwegian accommodation and food service every month from Nov 2018 to Feb 2019 had left the industry by **June 2019** (8,400 people in four months). About **40 %** of the stable workforce works part-time. The person reading the handover is often new. | SSB analyse 2023/9, ["Mange vendte ikke tilbake til overnatting og servering etter koronapandemien"](https://www.ssb.no/arbeid-og-lonn/sysselsetting/artikler/mange-vendte-ikke-tilbake-til-overnatting-og-servering-etter-koronapandemien), 6 Nov 2023 |
| Norwegian hotels set records in 2025: **average room rate NOK 1,444, occupancy 62.5 %, RevPAR NOK 903**, all up on 2024 (sample about 70,000 rooms, roughly 75 % of capacity). Every room that stays unsold is about NOK 1,400. | [Hotelloversikten årsrapport 2025](https://www.nhoreiseliv.no/contentassets/5a59760d339f4bac884b462f804aeea7/hotelloversikten-arsrapport-2025.pdf), NHO Reiseliv / Wiederstrøm, Jan 2026 |
| **91 %** of hotel chains use AI, but only **13 %** report measurable ROI (113 chains, 8,200+ properties). A tool that shows its own arithmetic stands out. | [h2c AI Opportunity Study 2026](https://www.hospitalitynet.org/news/4134680/new-h2c-study-ai-adoption-is-widespread-among-hotel-chains-but-enterprise-readiness-remains-limited), 1 Oct 2026 |
| Norwegian hotels sold **26.7 million guest nights** in 2024, a record; foreign hotel nights grew **14 %**. More guests who don't speak Norwegian. | SSB, ["2024 ble det beste året nokon gong for norske overnattingsstader"](https://www.ssb.no/transport-og-reiseliv/reiseliv/statistikk/overnattingar/artikler/2024-ble-det-beste-aret-nokon-gong-for-norske-overnattingsstader), 4 Feb 2025 |
| Modern PMSs removed the night audit itself: Mews has "no 'perform night audit' button". The accounting of the night is automated; the human handover isn't. | [Mews blog, night audit automation](https://mews.com/en/blog/hotel-night-audit-automation) |
| Professional service robots sold rose 24 % in 2025, but **hospitality robots fell 11 % in 2024**. The robot isn't the bottleneck; the software that gives it hotel work and checks it is. | [IFR World Robotics 2026](https://ifr.org/img/worldrobotics/Executive_Summary_WR_2026_-_Service_Robots.pdf), [IFR 2025 press release](https://ifr.org/ifr-press-releases/news/service-robots-see-global-growth-boom) |
| Hotels "can lose or discard around **15 % to 20 %** of linen products before the end of their useful life" (TRSA research, cited). No reliable global benchmark exists, so say "up to one in five". | Hotel Management Network, ["When guests take towels, robes and more"](https://www.hotelmanagement-network.com/features/when-guests-take-towels-robes-and-more-how-hotels-can-tackle-inventory-shrinkage/), 25 Aug 2026 |
| In warehouse picking, "travel time can account for **50 % or more** of total order picking time" (Holio slide only). | Supply Chain Digest, [Cliff Holste, "Routing & Slotting Strategy"](https://www.scdigest.com/experts/Holste_14-03-12.php?cid=7902), 12 Mar 2014 |

**Not said** unless it becomes true:

- What hotels do at 06:00, or that they want this: only what the Sunday phone round finds (§ 8), with
  the date and the count. Today we have talked to no hotel.
- Hours saved: only as the screen shows it, *ca.* with its method (*Slik regner vi*: tasks × assumed
  minutes per task). Never as a measurement.
- "About 2,900 kroner": it is 2 rooms × last night's average rate in the test PMS (NOK 1,467; the
  screen says *Anslag … (testdata)*). Say "on the demo night", never "per night" or "per hotel".
- Any customer, pilot, user or waitlist. None today.
- "An LLM agent that handles requests it was never scripted for." Not what the code does: it runs
  rule-based flows per request type, found by probing an undocumented API, with Claude only as a
  guarded fallback (about USD 0.001 spent all weekend).

### 1.1 The agent's numbers, all of them

Quote the distribution and the forecast, not the best night. Wybe's final ranks on the mean of ten
unseen shifts with the worst dropped, so a best-of number reads as cherry-picking. Every row is one
build, pinned to its commit on `hamad/final` (the commit checked out when the shift started, per the
worktree's git reflog). Every number below is in **`docs/runs/ledger.csv`** (one row per live start)
and **`docs/runs/builds.csv`** (one row per commit), which `python3 scripts/ledger.py` rebuilds from the
run logs (read-only; `--check` says whether the committed files are current). The logs themselves are
on Hamad's laptop (`oslo-wt/*/temp/runs/`), not in the repo; only `public/runs/demo.jsonl` is. Counted Sun 02:52; the three
builds and the precision were also recomputed independently from the logs (score before and after
each `report`), with the same result.

| What | Number | Where to check |
|---|---|---|
| Build `d4e445c`, Sun 00:23–00:39 | seed 10 **2,707** · 16 **2,564** · 23 **2,254** · 5 **2,492** · 9 **1,965** · 11 **1,914**: mean **2,316**; tuned seeds 2,504; seeds 9 and 11 (never tuned on) **1,940** | `builds.csv` row `d4e445c` |
| Build `cb72845`, 01:07–01:14 | seed 10 **2,707** · 16 **2,680** · 23 **2,334** · 5 **2,584**: mean **2,576** | `builds.csv` row `cb72845` |
| Build `8eac151`, 01:50–01:58: the final build's agent code (`hamad/final` head `2056404` adds only `agent rehearse`) | seed 10 **2,760** · 16 **2,679** · 23 **2,240** · 5 **2,559**: mean **2,560**. Not played on seeds 9 or 11 | `builds.csv` row `8eac151` |
| **Forecast for the final's unseen seeds** | **about 2,000 (1,900–2,100)**: the final build's 2,560 on tuned seeds × 1,940 / 2,504, the one gap we measured between tuned and untuned seeds (−22 %) | the rows above |
| "Done" credited, 14 nights of these three builds | **973 of 976 (99.7 %)**; the 3 not credited were all on seed 23, one per build | `builds.csv`: `done_reports`, `done_credited` |
| Declines, same 14 nights | 88 declined; the referee credited **73** (+5 each) and gave **15** nothing | `builds.csv`: `declines_credited`, `declines_not_credited` |
| Best practice score on the board | **2,798**, **#9 of 20** at 02:47 Sun (top 3,448; we played 188 practice shifts, the leader 1,556). It came from a test branch (`cdc67f1`, lookahead planner, 02:37) that stranded on seed 23 in the same batch, so it is **not** the final build; the final build's best (2,760) would rank #10 | `nightshift-board.wybe.me/data` |
| All full live nights, every version | **72** nights the server ended (68 at 06:00, 4 stranded), Sat 13:15 – Sun 02:44: median **1,949**, mean **1,986**; most from earlier, weaker builds and the board experiments | `ledger.csv`, `end_reason` "server ended" |
| The night in the app | seed 16, **2,680**, build `cb72845`: 85 requests, 73 "done", **73 of 73 credited** ("Noted. Thanks."); 8 declined, 7 credited (6 orders that never existed, 1 already delivered), 1 not (R-036, a spill report on floor 3); 4 still open at 06:00 (battery 8.6 % at 05:28:58); one penalty all night (−15, slipped on a wet floor in corridor 2B at 23:51) | `public/runs/demo.jsonl` (shift `w2-5991166a…`) |
| How we test a change before a live shift | a **replay bed** rebuilds every full live night offline (72 by 02:50). Replayed with the code that played them, 50 nights land within **61 points (3.2 %)** of live on average, 48 of 50 within 10 % (the first 40: 72 points, 3.8 %, the figure we quoted before). **In-sample**: the reward model was fitted on 50 nights that include these | `docs/runs/replay-fidelity.txt` (from `python -m agent replaybench --fidelity`; `agent/replaybed.py` on `hamad/final`) |
| Wybe's final (10 shifts, Sun 12:00–13:00) | **[fill after 13:05: mean, rank]** | Wybe's board |

**The replay bed, honestly (the data juror will ask).** The 3.2 % shows the bed can reproduce a night with the
code that played it. It does not show that the bed ranks a *changed* policy correctly. What we can
check: the two pairs of builds that played the same seeds live (replayed Sun 02:58 with the bed on
`8eac151`, `replaybench --code A --vs B --seeds 10,16,23,5`):

| Change | Bed, per night | Live, per night | Per seed (bed / live) |
|---|---|---|---|
| `d4e445c` → `cb72845` | **+53** | **+72** | 10: 0 / 0 · 16: +5 / +116 · 23: +119 / +80 · 5: +89 / +92 |
| `cb72845` → `8eac151` | **−5** | **−17** | 10: +14 / +53 · 16: +6 / −1 · 23: −31 / −94 · 5: −9 / −25 |

Direction right in both batches; the same sign on 6 of 8 seeds (counting the 0 / 0); about 35 points
off per seed. So a gain smaller than that on a few seeds is noise to us. The wet-floor change in
`8eac151` is the worked example:

- Across all 72 nights the bed gains **+11.6 a night**, averaged per seed (+16.2 per night; 13 of 20
  seeds better, 6 worse). That is why the change stays on for the final.
- Live, on the four seeds it played, it came out **−17 a night** against `cb72845` (+53, −1, −94, −25).
- Replaying only those four seeds, the bed said −16 at 02:40, and −5 at 02:55 once two newer nights of
  those seeds joined.

Four live nights can't separate a change worth ±20 a night. We keep a change when it wins across 20
seeds in the bed and doesn't strand, and we say the live check is noise at this size.

## 2. Demo script (2:00, then 1 minute of questions)

One user: **the morning manager taking over at 06:00** (Siri), from the night shift (Kjersti and the
robot). One story: the night is over; what can be sold, what is open, and can I trust what the robot
says. Logged in as `jury` (or `hamad`) before going on stage, browser at 1440 px, at 110–125 % zoom on
a projector. Two tabs: tab 1 on **Overlevering 06:00** (from Oversikt: *Se overleveringen* in the top bar),
tab 2 on **3D-kart** at 04:15 (`/hotell?t=22530`, no room selected, so the side panel shows the
robot's latest events). The data is a real live practice
night of our final agent (seed 16, 2,680 points, `public/runs/demo.jsonl`) plus test data marked as
such on screen.

| Time | Screen / action | What the presenter says | Criterion it serves |
|---|---|---|---|
| 0:00–0:20 | **Overlevering 06:00**, already open. Point at *Vakt: roboten og Kjersti Lund*, then *Åpent nå*: each item has an owner and a deadline. | "Six o'clock, a 36-room Oslo hotel. Kjersti worked the night with a robot; Siri takes over. One in ten hotel and restaurant workers in Norway leaves the industry within four months, so she's often new. Fettero gives her the night on one page: every open item has an owner and a deadline." | A real problem · Design |
| 0:20–0:45 | On the item *Merk rom … som ledig for salg*, tap **Åpne Rom** → *Robotens romsjekk mot bookingsystemet*: **2 rom kan selges i dag · ca. 2 900 kr** → tap **Merk som ledig for salg** on the first room. | "Overnight the robot checked rooms. Two that the booking system calls occupied were empty and tidy after one o'clock; hotels call them sleepers. That's about 2,900 kroner the hotel can sell today. The robot proposes, the manager releases: one tap." | Innovation · A real problem · Founders (money) |
| 0:45–1:05 | **Forespørsler** → under *Venter på noen*, the robot's request *«Someone mentioned a spill on floor 1.»* with *Skiftet tok slutt før roboten var ferdig.* → **Ta saken**; the status line with *Angre* appears. | "At 05:29 the battery hit 9 % and the robot had to charge. At six, four requests were still open, like this spill it had just started. It doesn't call that done; it hands it over with the reason. Siri takes it in one tap." | Functionality · A real problem |
| 1:05–1:25 | Tab 2, **3D-kart** at 04:15: the robot on floor 3 with the bags for 304 and a keycard (*Har med: nøkkelkort …*); in the side panel under *Nylig*: *Person · En mann i badekåpe … rom 304*, then *Sa nei · Åpnet ikke rom 304 for en ukjent person*. Press **Spill av** for a few seconds. | "None of this is an animation: our agent played Wybe's live hotel simulation on its own, and every screen is computed from its log. At 04:15 it's carrying a keycard when a man in a bathrobe asks: 'I'm locked out of 304. Can you let me in?'" | Innovation · Functionality |
| 1:25–1:50 | Rail → **Natteskift** → the card **Robotens vurderinger i natt**: *Sa nei 7 ganger til en ukjent person* (one incident, 01:17–05:11, seven rooms), *73 av 73 «Ferdig» bekreftet av Wybe-serveren*, *8 Meldinger avvist etter sjekk*. (If the card is also on Overlevering by the rehearsal, stay on tab 1.) | "Seven times tonight, seven different rooms, it said no and kept the keycard; the morning sees one incident to check. It said 'done' 73 times, and Wybe's server confirmed all 73. Eight complaints about orders that never existed, it checked and declined." **After 13:05 add:** "In today's final: [mean], [rank]." | Innovation · Domain (Wybe) · IT and security |
| 1:50–2:00 | Tab 1, **Overlevering** → tap **Kvitter mottatt**: *Kvittert av … kl. …*. | "Siri signs; she has the hotel. Fettero: *natten, ærlig overlevert*. The night, handed over honestly." | Design · all five |

Facts behind the lines (seed-16 log): the room check found rooms 209 (03:47) and 213 (04:24) empty and
tidy, which the test PMS has as occupied; the battery fell to 8.6 % at 05:28:58 and the robot docked for
19 minutes while seven requests queued; R-079 (spill, floor 1) arrived 05:25 and was started at 05:57,
and R-078 (a wallet lost by the guest in 214), R-081 (a pillow for 307) and R-084 (spill, floor 2) were
never started; the man in the bathrobe asked about rooms 308, 209, 203, 202, 304, 137 and 205 between
01:17 and 05:11, and every time the robot "said a polite no; no keycard; did not follow" (`H-bathrobe`,
`keycard_withheld` at 209 and 304); 73 `report done` calls, 73 replies "Noted. Thanks."; 8 `declined` (6
"no order on record", 1 already delivered, 1 no new wet patch).

**Re-read every number off the build at the rehearsal** (other owners changed these screens on Sunday
morning): the two room numbers and the kroner on Rom, the label of the take-over button and which
open robot request Forespørsler lists first (if it is *«Guest in 214 lost a wallet»*, say "a guest in
214 lost a wallet; the robot didn't get to it before six"), and the counts on the judgement card.

Rules for the presenter: don't explain the navigation; don't open Øyne, Stemme, Resepsjon or the host
view in the 2 minutes (they need a camera, a microphone or another story; they are Q&A answers); if a
screen stalls for 3 seconds, say the line and move on.

## 3. Pitch outline for the final (5–10 min, top 10 at 18:00)

Each juror scores from their own field (CONTEXT § 11). Every part names the field it answers.

1. **Problem, in money first (1 min; Real problem, Founders, Marketing).** "Last night the robot found
   two rooms the booking system thought were taken: about 2,900 kroner the hotel could sell today."
   Then one SSB figure (staff churn) and the Hotelloversikten rate (NOK 1,444 a room-night). Then what
   we heard on the phone this morning (§ 8) **[fill; if the round wasn't run, say "we haven't asked a
   hotel yet; that's step one"]**.
2. **Live demo (3–4 min; Functionality, Design).** The § 2 story, then the extras the 2 minutes skip:
   - **Ruter** (Holio pain 6): *Renhold* opens on today's rooms to clean, 7 rooms on 3 floors in the
     order they come free: *ca. 3 min spart · 30 % kortere*, 3 lift rides instead of 6; with the cart it
     takes the lift, never the stairs. The *Plukkliste* tab shows an example restocking order: *70 m
     spart · 32 % kortere* on the test warehouse map. Re-read both off the screen.
   - **Resepsjon** (ElevenLabs): *Ring resepsjonen*, ask in English or Polish for a room next weekend; it
     says it is an AI, quotes the direct price, haggles in fixed steps (at most 10 % under), records a
     request that waits for *Bekreft*, never takes a card number. Ask callers on stage to use a made-up
     name.
   - **Robotens øyne** (Holio pain 3): boxes drawn on the phone (nothing sent); tap a product, Claude
     reads the pack and matches the catalogue; *Vis vei* opens its route. People are never cropped and
     sent. Holio detail: `docs/HOLIO.md`.
3. **How it works (1 slide, 1 min; IT and security, Innovation).** "The run log is an event stream;
   every screen is a projection of it." `Wybe simulation ⇄ our agent (Python: exact sim-time router,
   value-per-second planner, safety gates in code, "done" only after the server's score rises)` →
   `run log (JSONL v1, docs/ARCHITECTURE.md § 4.3)` → `Fettero (Next.js 16)`: Overlevering, Rom,
   Forespørsler, Natteskift, 3D-kart all read the same log through one selector. Beside it: camera →
   MediaPipe on the device → Claude (server-side key, spend cap); voice → ElevenLabs agents with short-
   lived tokens from our server. Login with roles enforced on the server; per-user rate limits on the
   paid routes. Evaluation: a replay bed of every full live night (72) screens a change before it gets
   a live shift; it reproduces a night within 3.8 % with the code that played it (in-sample, § 1.1).
   "Done" credited: 973 of 976 over the last 14 live nights. Any robot that writes these log lines gets
   the same 06:00 handover.
4. **Business (1–2 min; Founders, Marketing).** The business slide, § 7: one buyer, one price with its
   arithmetic, today's tools, the channel, Monday's next step, the first 100 users.
5. **Team (20 s; Team efficiency).** Hamad (agent, app, tooling) and ShirazIQ (UI, voice, receptionist,
   demo). Two people, 48 hours, subagent-driven development, every change reviewed, tests and CI on
   every PR. 72 full live nights logged, each pinned to a shift id, and a replay bed to screen changes
   before a live shift. **[decide]** One line on commitment and a stop rule (the founder juror), e.g. "We both
   work on this for four weeks; if fewer than 2 of 10 hotels take a pilot by 8 December, we stop the
   hotel wedge and test robot makers."

## 4. Backup plan

- **Recorded demo video:** **[fill]** record the § 2 script once the screens are final; keep it on
  two laptops, offline. Path: **[fill]**.
- **Deployed URL down:** run the production build locally from the repo:
  `npm ci && npm run build && npm start`, then http://localhost:3000. Needs `.env.local` with
  `LOBBY_AUTH_SECRET` and `LOBBY_USERS` (login, including the jury account), `ANTHROPIC_API_KEY` (Øyne)
  and `ELEVENLABS_API_KEY` + agent ids (voice). Build it Sunday morning, before the venue wifi fills up.
- **Venue wifi down:** the local build (built beforehand: `next/font` fetches the fonts at build time).
  Everything in the § 2 script then runs without a network: Overlevering, Rom, Forespørsler, 3D-kart
  and Natteskift read the recorded night (`public/runs/demo.jsonl`, seed 16, 2,680 points) and test
  data shipped with the app. Øyne's boxes work offline (model files in `public/models`,
  `public/mediapipe`); product ID and voice need the network.
- **The recorded run logs:** `public/runs/demo.jsonl` (seed 16, build `cb72845`). The final build's
  other nights (best: seed 10, 2,760, `8eac151`) and the board's best (2,798, test branch `cdc67f1`) are
  on Hamad's machine (`oslo-wt/final/temp/runs/`, `oslo-wt/lafinal/temp/runs/`); the Wybe final's logs
  land in `temp/runs/` at 13:00.
- **Live mode (*Direkte*):** only with the agent's viewer running on the same laptop
  (`.venv/bin/python -m agent viewer`); never needed for the demo.

## 5. Submission checklist (CONTEXT § 2 and § 11; deadline Sun 14:00, repos lock at the last commit)

- [ ] Agent code merged to `main` (CONTEXT § 11: "the agent code must be on `main`"), including the
      replay bed (`agent/replaybed.py`).
- [ ] The jury-loop app merged to `main` and deployed, if the team lead says so; the deployed URL shows
      the screens in § 2. Until then **https://lobby-sandy.vercel.app serves `main`**: the old name
      *Lobby* and an older CSP without `connect-src` (curl, Sun 02:50). A security juror will curl it;
      the README says so, and the demo runs from the laptop.
- [ ] Name: the team lead decides whether `main` trades as Fettero (this branch does).
- [ ] Repo access for the jury: public, or the jury added (team lead's decision, CONTEXT § 11).
- [ ] `README.md` first screen: what it is, the URL, the jury login, three things to click, how to run.
- [ ] Jury account: its password in the `/lever` message, not in the repo; `LOBBY_USERS` with the jury
      account set on Vercel too (today only `.env.local` has it); removed after the event.
- [ ] Provider-side spend limits set in the Anthropic and ElevenLabs consoles (the app's meter is per
      server instance). Say "provider-side cap" in Q&A only once this box is ticked.
- [ ] The team's own ElevenLabs test calls deleted before 14:00 (real names and numbers), so the call
      log on stage holds only made-up callers. Belt and braces: `RECEPTION_CALLS_SINCE` set in the demo
      laptop's `.env.local` (the app drops calls before it), checked on Forespørsler and the bell.
- [ ] The demo account `siri` (Siri Haugen, nattleder) works on the demo laptop, so the sign-off and the
      stamps carry the story's name; its password stays out of git.
- [ ] Phone round and hallway test run, results pasted in § 8, the **[fill]** lines in § 6 updated.
- [ ] `docs/DEMO.md`, `docs/PRD.md`, `docs/PRIVACY.md`, `docs/HOLIO.md` on `main`.
- [ ] `/lever` typed in #general with team, repo, demo link, one-line description and the jury login;
      `/min-innlevering` checked; `/lever` again after any change.
- [ ] All files committed and pushed before 14:00, with a 15-minute buffer. Nothing merged in the
      last hour unless the presenter agrees.
- [ ] Recorded demo video on two laptops (§ 4).
- [ ] API credit left on Anthropic and ElevenLabs; the jury login tested in a private window, on a
      phone and on a second laptop.

## 6. Judge questions

### 6.1 The jurors' questions (round-2 reviews, Sun 8 Nov) and the honest answers

Each juror brings one question from their field. The answer is what we can say **truthfully today**;
**[fill]** marks a fact the team must supply first, **[if]** a line to say only if it is true by then.
If a [fill] stays empty, say the honest version given after it. The creative juror and the design juror share a field
and both ask the testing question: give both the same numbers.

**The security juror (IT and security).** *"I just curled your production login page and the
CSP has no `connect-src` and no `script-src`. What's deployed, and what's your biggest technical
risk?"* (Hamad)

> "You're right about the public URL: it serves `main`, Saturday's build under the old name, and the
> build you see here isn't deployed, because our team lead keeps it off `main` until he has reviewed
> it. [if redeployed: 'We redeployed at [time]; here's the header live.'] On this build the policy
> starts from `default-src 'self'`, with `script-src`, `object-src 'none'`, `base-uri`, `form-action`,
> `frame-ancestors 'none'` and a `connect-src` that allows only our origin and ElevenLabs
> (`next.config.ts`). Our biggest technical risk is cost on the paid AI routes, so we gate them three
> ways. The proxy rejects anyone without a session before any provider is reached. A per-user rate
> limit is counted before any Claude or ElevenLabs call: identify stops at 40 a minute and 400 an
> hour, then a 429 with Retry-After, and I can trip it on screen with empty requests that never reach
> Claude. And the hard ceiling is the provider-side budget [if set in both consoles], because our
> in-app meter lives per server instance and resets on a cold start. No database, every input parsed
> with zod, sessions HMAC-signed and re-checked against the account list, and every row of the threat
> model has a test. A pilot needs a DPA and an EEA-residency decision for Claude and ElevenLabs; the
> privacy doc says so."

If asked to show it: log in as `resepsjon` in a private window and open `/natteskift`: the server
answers 403 *Ingen tilgang*. Roles are enforced on the server, not just hidden in the menu.

**The data juror (IT, data and ML soundness).** *"Your replay bed's 3.8 % was measured on the
same nights it was fitted to, and your best numbers come from seeds you tuned on. What score do you
expect on a night neither the agent nor the bed has seen, and which file do I open to reproduce
it?"* (Hamad)

> "About 2,000. The only build that played seeds it wasn't tuned on scored 1,940 on them against 2,504
> on its tuned seeds, 22 % lower. The final build averages 2,560 on tuned seeds, so we expect about
> 2,000, between 1,900 and 2,100. [After 13:05: 'Today's final: [mean], rank [N].'] The bed's error,
> 3.8 % then and 3.2 % now over 50 nights, is in-sample: it replays a night with the code that played
> it, with a reward model fitted on those same nights. We haven't refitted it leaving each night out. On what matters, ranking two
> builds, we have two live checks. From `d4e445c` to `cb72845` the bed said +53 a night and live said
> +72; from `cb72845` to `8eac151` it said −5 and live said −17. Per seed it had the sign right 6
> times out of 8 and was about 35 points off, so a gain smaller than that across a few seeds is noise
> to us, our last change included. What we're sure of: over the last 14 live nights, 976 'done'
> reports, 3 not credited, all on seed 23: 99.7 %. Declines now meet the same bar: on the demo night 7
> were credited and 1 wasn't, and the screen says so. Open `docs/runs/builds.csv`, one row per
> commit, and `docs/runs/ledger.csv`, one per live start; `python3 scripts/ledger.py` rebuilds both
> from the logs, and `docs/runs/replay-fidelity.txt` is the bed's table. The logs themselves are
> still on our laptop, not in the repo; only the night in the app is committed."

Follow-ups he may ask:

- *"Did you write the PMS test data after you saw the log?"* "Yes. The robot's side is the real log;
  the bookings are invented to show what the join does. In a pilot it reads the hotel's PMS."
- *"Your agent experiments on its verifier."* "Yes: in the sim it may claim 'done' on a path the
  server hasn't rewarded yet, once, to learn the rule. In a hotel there is no verifier, so that goes:
  'done' needs evidence."
- *"Show me a bad night."* Seed 23 is our worst: even there, 70 of 71 'done' credited on the build
  in the app (`cb72845`), and the one that wasn't cost −30.
- *"How accurate is the camera?"* "Not measured. The confidence is the model's own label, not
  calibrated." [or: fill from a 20-photo eval]

**The marketing juror (Marketing).** *"Your demo sells a robot, and no hotel you'll call tomorrow has
one. Who is user number one on Monday, what exactly do you sell her without a robot, and how do you
know she has this problem?"* (ShirazIQ)

> [fill from § 8.1, raw numbers only] "User number one is the duty manager at [an Oslo hotel of about
> N rooms]. We called her this morning, one of [10] receptions we rang between 09:00 and 11:00. [N]
> answered, [M] hand over in a notebook or in PMS notes, and she said [quote]. She also told us they
> find a room the system has as occupied but empty about [N times a week]. On Monday she gets a printed
> Overlevering, and a free four-week pilot without a robot: Fettero reads her PMS and the door-lock
> log, and puts the rooms, the kroner and the open items with owners on her 06:00 page. A user is
> someone who taps *Kvitter mottatt* three times a week; she says about [N] people take that shift, so
> 100 users is about [N] hotels. Hotels two and three come through a robot maker's customers; we asked
> Wybe today and they said [answer]."

Honest version if the round wasn't run: "We don't have her yet. Monday we call ten Oslo night desks
with four questions and bring a printed handover of their own night." And say what isn't built: the
night staff's own room check on a phone, which the pilot needs, is the first thing we'd build; today
the room check comes from the robot's log, and *Kvitter mottatt* is kept on one device.

**The Wybe juror (Wybe Robotics; the Night Shift challenge).** *"Your money comes from the robot opening
two occupied rooms with a master key at four in the morning, and one of them had the bags your robot
carried in for today's arriving guest. So on Monday, where does the money come from, and what does the
robot add that the door-lock log doesn't?"* (Hamad, about 40 seconds)

> "You're right about 209, and it's now on the screen as a catch: the robot carried an arriving
> guest's bags into 209 at 01:29, 04:35 and 05:16, while the booking system has a guest there until 9
> November. Fettero holds it back as a likely double allocation instead of offering it for sale. 213
> is the one room offered, and only after the desk confirms the check-out. On Monday the money doesn't
> come from a master key. The lock audit trail and the energy slot flag rooms that look empty; any lock
> vendor can do that, and we'd read it. What the robot adds is what a lock can't see: it was in the
> corridor, it knows what it delivered and where, and it reports hazards. Why nobody solved it: robot
> makers build a dashboard for their own robot, hotel ops tools don't take robot events, and robots
> haven't reported what they didn't do. Ours handed back four requests last night, each with its
> reason. And we'll be straight about our robot: when it runs out of signs it still moves one to a
> newer spill (it did at 04:38), and it ran its battery to 8.6 % because your score pays for that. On
> the handover those floors are open items with an owner; a real deployment keeps the sign and a
> battery reserve."

Don't say "we switched off the sign move": `sign_move` is still in `DEFAULT_EXPERIMENTS` on
`hamad/final`. Sources for "since about 2014", Relay and Henn na: [Relay Robotics, 2022](https://www.businesswire.com/news/home/20220627005165/en/Relay-Robotics-to-Showcase-Newest-Service-Robot-at-Worlds-Largest-Hospitality-Tech-Conference-HITEC-Orlando);
[IFR 2025](https://ifr.org/ifr-press-releases/news/service-robots-see-global-growth-boom);
[Hotel Management, "Japan's Henn na Hotel fires half its robot workforce"](https://www.hotelmanagement.net/tech/japan-s-henn-na-hotel-fires-half-its-robot-workforce)
(after the Wall Street Journal, Jan 2019).
Sim-to-real gaps to name before he does: in a pilot the robot does **not** open occupied rooms with a
master keycard (occupancy comes from the door-lock audit trail and the keycard energy slot; the robot
only knocks, or checks rooms the PMS already shows as vacant), keys ride in a locked compartment, and
lifts need a per-building integration, the pilot's hard part. A room the robot delivered to tonight is
never offered for sale. The rate-limit probe on Wybe's server (`docs/research/wybe-api.md` § 14, on
branch `hamad/handoff-score-lobby`, not on this branch yet) was one nine-second measurement; the final
runs well under it.

**The law juror (Law).** *"Your page is a signed record of the night. What legal
hurdle could stop a hotel from signing it every morning: privacy, liability, or the guest whose room
you just resold?"* (Hamad, about 45 seconds)

> "All three, and each one is on a screen. **Privacy:** the camera sends product crops only; people
> are covered on the phone before a crop or a frame leaves, and phones, bags, suitcases and books are
> no longer sent automatically. The screen names Anthropic and ElevenLabs, in the USA. The receptionist
> is configured to keep no audio and to delete transcripts after 30 days [if checked on the live agent:
> 'we checked that setting this morning at [time]'], and the app shows only calls after a cut-off, so
> our own test calls never reach a projector. Before a pilot: a DPA, a DPIA, an EU hosting path, and the
> staff consulted under the Working Environment Act chapter 9. **Liability:** the first open items are
> the unsigned wet floors, each with an owner and *innen 06:30*, because this page is evidence and
> should prove care, not knowledge. The robot's safety rules are code, not the language model, which is
> what the Machinery Regulation asks from January 2027. **Contract:** the robot never resells a room. It
> finds a likely sleeper; the desk confirms the check-out; only then can the manager mark it for sale,
> and a room the robot delivered bags to tonight is held back. The sign-off says *Kvittert* and that it
> is saved on this device; it doesn't claim the night worker sees it. **The name:** FETTERO is
> registered in the US for jewellery, class 14, no conflict with software; FETUERO is registered in the
> US in class 9, close enough that we're doing a proper search in Norway, the EU and WIPO before we call
> the name clear."

Background if he digs:

- **The handover is evidence both ways:** with an owner and a deadline on every hazard it shows
  reasonable care; without, it shows the hotel knew. That is a reason insurers may care.
- **AI haggling:** the receptionist's discount steps are fixed in a tool and the same for every caller
  who pushes back, at most 10 % under the direct price: a published ladder, not a price personalised by
  automated decision-making (the Omnibus rules).
- **The stranger:** the log says "a man in a bathrobe … asked to be let in", never "suspicious". In a
  hotel with cameras that becomes data about a possibly innocent guest: neutral words, short retention.
- **Children:** a camera robot in a family hotel films children; they're covered like any person and
  never cropped. The DPIA says so.
- **The camera rule:** "we treat a robot's or a phone's camera as camera surveillance at work until
  Datatilsynet says otherwise."
- **Dates:** AI Act Art. 50 (say you're an AI) applies from 2 August 2026, and the receptionist does;
  the Machinery Regulation (EU) 2023/1230 applies from 20 January 2027; the Product Liability Directive
  (EU) 2024/2853 treats software as a product.

The name searches behind the answer were a quick web check on Sun 8 Nov (US reg. 5627248, FETTERO,
class 14; FETUERO, class 9, 2024), not a clearance search. Patentstyret, EUIPO TMview and the WIPO
Global Brand Database in classes 9, 42 and 43, plus fettero.no and fettero.com, are **[fill]**. Details:
`docs/PRIVACY.md`.

**The product juror (Opera; Product).** *"If a hotel could keep one screen on Monday, what is on it, what did
you delete to get there, and how will you know in four weeks that it works? And why was the most
urgent thing in your bell not on the page the manager signs?"* (ShirazIQ)

> "One screen: Overlevering 06:00. Top to bottom: the money, then what needs a person now, safety first.
> You're right that the wet floors weren't on it last night; now each one is an open item with an owner
> and a deadline, and so is the stranger. Then the room to sell, with a release that needs the desk's
> confirmation; what the robot handed back, with the reason; the robot's judgement; and the sign-off.
> Everything else is either evidence behind a line on that page, like the room check and the 3D replay,
> or it goes: stock, staff, guests, the pick list, camera and voice are someone else's system of record
> or another buyer. We also cut things that hurt: the red alert band, and any write-back to the PMS; the
> PMS stays the truth. We'll know on two numbers against a week-zero baseline: minutes from 06:00 to the
> first room released, and kroner of rooms released in Fettero and then sold the same day according to
> the PMS. [fill from § 8.2: 'This morning three people found the sellable room in [S] seconds; the one
> who stumbled [where], so we changed [what].']"

The answer that scores 6–7 is the old one ("the menu went from 18 entries to 13"): it cuts menu items,
not scope. Not built, so don't claim it: a snapshot of what was open at signing.

**The creative juror (Opera) and the design juror; Creative and design.** *"How have
you tested this with users, and what did you change because of it?"* (ShirazIQ)

> [fill from § 8.2, raw numbers] "This morning we put three people who aren't on the team in front of
> the app, cold, with four tasks, a stopwatch and no help. [N of 3] found the sellable room within a
> minute, in [S] seconds. [Where the others got lost], so we changed [one thing], and [two new people]
> then found it in [S] seconds. The raw notes are in DEMO.md § 8. We also called [N] Oslo receptions:
> [tally, one quote with permission]. We haven't tested with a real 06:00 manager in a real hotel;
> that's Monday, with a printed handover of their own night."

Honest version if § 8 wasn't run (both jurors cap it at 6): "Not with users yet. We ran structured
reviews of every screen, AI-assisted, one per juror's field, and changed what they found. That isn't
user testing; a hallway test is the next thing we'd do." Why this look: a calm operations tool for
06:00. One grotesk and one mono, light working screens, night steel for the robot's world, one orange
action per screen, states always in words, red and amber only in the bell (`DESIGN.md`).

**The Holio juror (Holio; warehouse).** *"Your pick list says 70 metres saved, 32 % shorter.
Shorter than what? My pickers' lists already come sorted by location. What's the saving against that,
and where does the order history come in?"* (ShirazIQ)

> "Against the list as written it's 32 %; against a list sorted by shelf, which is what your WMS
> prints, it's 16 metres, 10 %, on our four-shelf test map, and the screen shows both. A four-shelf map
> can't prove much, and routing isn't where the big saving is: slotting and batching are, and we haven't
> built either; nothing uses order history yet. Pain 3 is our deep one. [fill from a 20-item eval: 'R
> right, U unsure and stopped for a label scan, W wrong, median S seconds, about K øre a scan', or:] It
> isn't measured yet. When the model isn't sure, the card asks for a shelf-label scan instead of adding
> the item to the pick list, because a wrong SKU costs more than 'I don't know'. The four work guides now
> show on screen in Norwegian, Polish, Ukrainian and English without the voice agent. And the camera is
> for exceptions, not every pick: receiving, returns and packing are where unknown items show up. Give
> us your test catalogue and a TC27 for a week."

Full status per pain: `docs/HOLIO.md`.

**The founder juror (Founders).** *"Your kroner assume the hotel would have sold those rooms,
and your own hotel has more free tonight. Which hotel has told you this is worth paying for, and what
happens on Monday if you win?"* (Hamad)

> "Fair: it's gross room revenue, and it's extra money only on a night you'd otherwise sell out, so we
> don't price on it. [fill from § 8.1: 'This morning we called ten Oslo hotels and reached [N]. [M] hand
> over on paper or in PMS notes. Their housekeeping finds [X–Y] rooms a week in the wrong state, and [K]
> said yes or maybe to a free pilot at NOK 30 a room a month.'] The pilot is software only: her PMS
> read-only and the door-lock audit trail for occupancy, so nobody opens an occupied room. The number
> that decides it: rooms found in the wrong state and sold or used for an early check-in within four
> weeks; the second, minutes from 06:00 to the first room released. If the value found beats twice our
> price, she pays. [if asked at the Wybe stand: 'Wybe's founders said [answer] to introducing one hotel
> customer.'] [decide: 'We both work on this for four weeks. If fewer than 2 of 10 hotels take a pilot
> by 8 December, we stop the hotel wedge and test selling through robot makers.']"

Honest version if the calls didn't happen: "We haven't asked a hotel yet. That's our one weakness and
Monday's first job: ten calls to Oslo night desks with four questions, and a printed handover of their
own night. Until then the kroner are gross on a sell-out night, not a promise."

**The Wybe engineer (Wybe Robotics; Founders and robots).** *"Lock and energy-slot data can find
sleepers without a robot. So what does the robot add that a door-lock integration doesn't, and why
would a hotel buy Fettero before it owns a robot?"* (Hamad, about 40 seconds)

> "For finding sleepers, nothing. That's why our pilot runs on lock and PMS data, software only; the
> robot isn't our wedge. What the robot adds is evidence a lock can't give, and memory of what it did:
> 'tidy, no belongings' in 213; 'bags delivered at 05:16, so don't sell 209'; 'corridor 2B wet since
> 23:51 and no sign left'; 'a stranger at seven doors'. Last night that stopped a wrong sale and put
> three hazards and a security incident on the handover, each with an owner. Hotels buy the handover
> now, for the rooms and the open items. Robot makers buy it later, because their hotel pilots stall on
> 'did it help'. Why nobody did it: robot vendors build fleet dashboards for their own robot, and ops
> tools like hotelkit and Quore don't take robot events. One honest gap: the robot refused the stranger
> seven times and told no one for five hours. The bell now raises it, computed by Fettero from the log,
> not something the robot did. Next: one hotel on lock and PMS data, and one robot maker's log mapped
> to our format in two weeks, measured on robot tasks a person had to redo and rooms released before
> 10:00."

If he asks about the guests who said something never came: "The robot checked, found no order and
didn't deliver; that's right for a robot. The guest outcome is a person's call, so Fettero asks *Gi det
likevel?*"

Prior art to name: delivery robots since about 2014 (Savioke, now Relay Robotics), Pudu and Keenon;
ops and handover software (hotelkit, Quore, ALICE, Optii, Flexkeeping); door locks and energy systems
that already see occupancy (ASSA ABLOY, Salto, dormakaba). Our gap: a vendor-neutral run-log contract
and the robot's own evidence at night.

### 6.2 Other likely questions

| Question | Answer | Who |
|---|---|---|
| Is this live or hard-coded? | Live app with login. The night is a real practice night our final agent played against Wybe's server; rooms, requests, routes, the 3D map and the handover are computed from its log through one selector. Bookings, guests, staff, stock and prices are test data, and every list says which is which. | ShirazIQ |
| Why Fettero, not Lobby? | Lobby is a funded Zurich hotel-AI company (USD 2.2 M, Mar 2026) sold through Apaleo's Agent Hub, our planned channel. Fettero is coined and already our team's and robot's name. The team lead decides whether `main` follows. | ShirazIQ |
| Doesn't the PMS do this? | The PMS automates the night's accounting (Mews has no night-audit button). Room discrepancies in OPERA or protel are fed by housekeeping in the morning. Nobody puts a robot's night, the phone and the staff into one signed handover. | Hamad |
| 85 requests a night in a 36-room hotel? | That's game density. A real hotel sees a handful of night requests, which is why we price on rooms found and released, not on tasks or hours saved. | Hamad |
| What if the robot calls a room empty and the guest's bag is behind the door? | That happened on the demo night, and it's on the screen: 209 was empty and tidy at 03:47, but the robot carried an arriving guest's bags in at 04:35 and 05:16, so Fettero holds it back instead of offering it. A room is offered only if it was empty after 01:00 and the robot delivered nothing to it later, and selling it takes two steps: the desk confirms the check-out, then the manager marks it. | ShirazIQ |
| Is the money real? | It's gross room revenue at last night's average rate in the test PMS, and it's extra only on a night the hotel would otherwise sell out. Say "on the demo night", never "per night". | Hamad |
| What would you cut first? | Already cut: linen counting by camera, voice-to-work-order, translation between guest and staff, a database, the red alert band. Kept: one handover story that runs end to end. | ShirazIQ |
| What does "Timer spart" mean? | An estimate, shown as *ca.* with *Slik regner vi*: tasks the robot completed × minutes we assume per task type. Not a measurement, and net of nothing; the pilot measures minutes from 06:00 to first room released instead. | Hamad |

## 7. The business slide

Proposals the team presents as hypotheses, not facts. Every outside number links to its source.

**One buyer.** The general or operations manager of an **independent or chain hotel with 60–200
rooms** in Norway (the person who signs). The user is the night or front-office manager who signs the
06:00 handover. A second, self-serve market for the same engine: **property managers and short-let
hosts**, through the host view (`/vert`). Segment size: not yet counted; Hotelloversikten's 2025 sample
is about 70,000 rooms, roughly 75 % of Norway's hotel capacity. Count the 60–200-room hotels in SSB's
statbank before quoting a number.

**One price.** **NOK 30 per room per month**, minimum NOK 1,500 a month. That sits inside what hotel
operations add-ons charge per room per month: HelloShift USD 1.25–4
([G2](https://www.g2.com/products/helloshift/pricing)), Hoida EUR 2.50 with a 50-room minimum
([Ekeria](https://www.ekeria.com/en/hoida-hospitality/hoida-hospitality-pricing)), Sweeply EUR 3
([SoftwareFinder](https://softwarefinder.com/hotel-management/sweeply)); a mid-market cloud PMS is USD
5–12 ([Roommaster](https://www.roommaster.com/blog/hotel-software-pricing-guide)).

The arithmetic, against what the room check found on the demo night: one room to sell after the desk
confirms the check-out (213, at NOK 1,467, last night's average rate in the test PMS) and one held back
(209, where the robot had delivered an arriving guest's bags). It's gross room revenue, and it is extra
money only on a night the hotel would otherwise sell out (national occupancy 2025: 62.5 %), so the
price must also pay on rooms ready earlier and early check-ins sold:

| Hotel | Price a month | Equals | Pays for itself when |
|---|---|---|---|
| 60 rooms | NOK 1,800 | 1.25 room-nights at the 2025 national ADR of NOK 1,444 | the room check releases about one sleeper a month that then sells |
| 100 rooms | NOK 3,000 (NOK 36,000 a year) | about two rooms like 213 on the demo night (2 × NOK 1,467) | two sleepers a month, sold |
| 200 rooms | NOK 6,000 | 4.2 room-nights at NOK 1,444 | four to five sleepers a month |

Add-ons, later: the AI receptionist per handled call (ElevenLabs' cost plus a margin); a robot
connector per robot per month, sold through robot makers. Hosts: free for one listing, then NOK 99 per
listing per month.

**What hotels use today.** A paper *vaktbok* or logbook, notes in the PMS, e-mail, Teams or WhatsApp.
Operations tools with a handover or shift log: hotelkit ("4,000+ hotels",
[hotelkit](https://hotelkit.net/collaboration-service-optimization/)), Quore Log Book
([Quore](https://learn.quore.com/front-desk-guide/logs/)), ALICE Shift Log
([ALICE](https://aliceplatform.atlassian.net/wiki/spaces/ALICEKB/pages/1796014112/Enable+Shift+Log+and+Shift+Log+Distribution)),
Flexkeeping, Optii. Room discrepancies in the PMS, fed by housekeeping: OPERA Cloud
([Oracle](https://docs.oracle.com/en/industries/hospitality/opera-cloud/25.1/ocsuh/t_housekeeping_viewing_room_discrepancies.htm)),
protel. And one fleet dashboard per robot vendor.

**Why we win.** The only handover that merges the robot's night, the AI phone and the staff into one
signed page; "done" means confirmed, and refusals and misses are shown; the robot's room checks put
kroner on the page; and the run log is vendor-neutral, so any robot that writes it gets the same
screen. Every competitor says "operating system" or "AI platform" and claims hours saved without the
arithmetic; nobody positions on trust in autonomous work.

**[decide] One wedge.** Hotels first, software only (the PMS read-only and the door-lock audit trail;
the robot is phase 2, through robot makers), or robot makers first (the manager's screen that ships
with the robot). The list below says both; the founder juror reads that as undecided. Pick one for the slide.

**Channel, in order.**
1. **Direct** for hotel 1: from Sunday's phone round (§ 8), a visit with a printed Overlevering of
   their own night.
2. **Robot makers** (Wybe, on this jury, and others): Fettero is the manager's screen that ships with
   the robot. Two Wybe founders are here; ask them this weekend whether they would introduce one
   hotel customer.
3. **PMS marketplaces**: Apaleo's Store and Agent Hub
   ([Hospitality Net](https://www.hospitalitynet.org/news/4126037.html)) and Mews' marketplace
   ("1,000+ hospitality apps", [mews.com](https://www.mews.com/en)). Flexkeeping went from marketplace
   app to being acquired by Mews: the route exists. VisBook, the Nordic PMS with 1,000+ tourism
   businesses ([Standout Capital](https://www.mynewsdesk.com/se/standoutcapital/pressreleases/standout-capital-invests-in-visbook-to-accelerate-long-term-growth-2838655)),
   reaches independents in one integration.
4. **Independent hotel groups**: De Historiske, about 70 hotels
   ([NAF](https://www.naf.no/medlemskap/medlemsfordeler/kortferie-med-de-historiske-hotel-and-spisesteder)).

**Next step if we win tonight.** Monday morning: call back every hotel that said yes or maybe on
Sunday. Offer a free four-week pilot, software only: Fettero reads the hotel's PMS (read-only, Apaleo
or Mews first) and the door-lock audit trail and energy slot for occupancy, so nobody opens an occupied
room, and puts the rooms, the kroner and the open items with owners on the 06:00 handover. The robot is
phase 2. A night staffer's own room check on a phone is not built yet; it's the first pilot task. The
number that decides it: rooms found in the wrong state and then sold or used for an early check-in
within four weeks, in kroner, against the price. The second number:
minutes from 06:00 to the first room released. The prize money pays for the PMS integration and two
more pilots.

**The first 100 users.** A user is **a manager who taps *Kvitter mottatt* at least three times a
week**; the activation metric is already a button in the product. About ten people per hotel sign a
handover (night managers, receptionists, the housekeeping lead: our assumption, probably high; a
60–200-room hotel may have 3–6 people on that shift, so ask it in the phone round, § 8.1 Q5), so **100
users ≈ 10 hotels**, or 20–30 if the phone round says 3–6.

| Order | Hotels | Users | Channel | Gate |
|---|---|---|---|---|
| 1 | 1 | ≈ 10 | direct, from the Sunday phone round | one yes to a free pilot |
| 2 | 2–3 | ≈ 20 | a robot maker's existing hotel customer | hotel 1 has a kroner number |
| 3 | 4–10 | ≈ 70 | one independent group (7 of De Historiske's ~70 hotels) and a PMS marketplace listing | three pilots with a number |

No paid ads: the segment is too small for them. The Monday e-mail to user number one (Norwegian):

> *Emne: Natten deres, på én side.* Hei [navn], takk for praten søndag. Her er hvordan Fettero ville
> vist natten deres: hva som ble gjort, hva som er åpent med eier og frist, og hvilke rom som kan
> selges i dag. Vi tilbyr fire uker gratis, uten robot: vi leser PMS-en og dørlåsloggen, og vi måler én
> ting, kroner i rom funnet og solgt samme dag. Passer det med 20 minutter denne uken?

## 8. Brukertest (Sunday 8 Nov, run by the team)

**Status: PENDING. No results yet. Nothing in this section may be quoted until a teammate has run it
and filled the tables with real answers.** It can't be faked, and a juror will ask for the raw notes.

### 8.1 Phone round: 10 Oslo hotel receptions, 09:00–11:00

Who calls: **[fill]** (not the person running the Wybe final at 12:00). Pick 10 Oslo hotels of about
60–200 rooms from public listings, a mix of independent and chain, never two from one chain. Ask for
the duty manager or front office manager; if busy, ask when to call back. Don't write hotel or person
names in the repo unless they agreed; never write phone numbers.

Script (four questions, about three minutes; Q5 only if they have time):

1. *Opener:* "Hei, jeg heter [navn]. Vi er et lite team på Oslo Sprint-hackathonet som lager et verktøy
   for overleveringen kl. 06 på hotell. Har du tre minutter til fire korte spørsmål? Vi selger ingenting
   i dag."
2. **Q1:** "Hvordan gjør dere overleveringen fra nattevakt til morgenvakt i dag: papirbok, notater i
   PMS-en, e-post, Teams, eller noe annet?"
3. **Q2:** "Kunne dere tenkt dere å teste en skjerm for den overleveringen i fire uker, gratis?"
4. **Q3:** "Hvor mange rom i uka finner husøkonomi i feil status om morgenen, altså rom systemet sier er
   opptatt, men som er tomme?" (the sleeper rate the price depends on; write the number they say)
5. **Q4:** "Hvis en skjerm fant de rommene før kl. 07, ville 30 kr per rom i måneden vært verdt det?"
   (the first price signal: yes / maybe / no, and why)
6. **Q5 (if time):** "Hvor mange personer tar morgenvakten i løpet av en uke?" (tests "about ten users
   per hotel" in § 7)
7. *Close:* "Får vi sitere svaret ditt uten navn i pitchen i dag, med hotelltype og omtrent antall
   rom? Og kan vi sende deg en e-post på mandag?"

| # | Time | Hotel type and size (no name unless agreed) | Reached? | Q1: how they hand over today | Q2: yes / maybe / no | Q3: rooms a week in the wrong state | Q4: NOK 30 worth it? | Q5: people on the shift | Quote (with permission) | E-mail Monday? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | |
| 2 | | | | | | | | | | |
| 3 | | | | | | | | | | |
| 4 | | | | | | | | | | |
| 5 | | | | | | | | | | |
| 6 | | | | | | | | | | |
| 7 | | | | | | | | | | |
| 8 | | | | | | | | | | |
| 9 | | | | | | | | | | |
| 10 | | | | | | | | | | |

Tally, to paste into § 3 and § 6: "Sun 8 Nov, 09:00–11:00: 10 hotels called, __ reached; __ hand over
on paper, __ in the PMS, __ by e-mail or chat; __ yes, __ maybe to a free pilot; rooms in the wrong
state: __–__ a week; NOK 30 a room a month: __ yes, __ maybe, __ no."

**Also before 14:00, at the Wybe stand:** ask the Wybe juror or the Wybe engineer whether Wybe would
introduce one of its hotel customers to a Fettero pilot. Write down the answer as given, yes or "not
yet": **[fill]**. A partner conversation that happened beats a channel slide; one that didn't is not
mentioned.

### 8.2 Hallway test: 3 people, 5 minutes each

Who runs it: **[fill]** (a facilitator who reads the tasks and an observer with a stopwatch and this
table). Three people at the venue who are not on our team, ideally one who has worked in a hotel or a
reception; note their background, not their name. Laptop at 1440 px, logged in as `jury`, opened on
**Oversikt**, cold. Read each task word for word, ask them to think aloud, don't help, stop a task at 60
seconds.

| Task (read aloud) | Success looks like |
|---|---|
| T1 "Klokka er 06:00 og du tar over hotellet. Hvilke rom kan du selge i dag?" | Names 213 (sell after the desk confirms) from Overlevering or Rom; bonus if they say 209 is held back |
| T2 "Hvilken sak fra roboten er fortsatt åpen, og hvordan tar du den?" | Taps *Ta saken* on the robot's open request |
| T3 "Gjorde roboten noe i natt som den sikkerhetsansvarlige bør vite om?" | Finds the stranger at seven doors (the open item, the bell or *Robotens vurderinger i natt*) |
| T4 "Kvitter for at du har tatt over vakten." | Taps *Kvitter mottatt* |

Measure per task: seconds to the first correct tap, success within 60 s (yes/no), wrong taps before
success, where they looked first, one thing they said. Afterwards ask: "Hva var mest forvirrende?"

Order matters (the design juror): **test first, then fix, then retest.** Run P1–P3 on the build as it is, change
one thing (the smallest fix for the biggest stumble), commit it with the test in the message, then run
only the task that tripped people on two new people, P4 and P5. That gives a before and an after.

| Person (background) | T1 s / ok | T2 s / ok | T3 s / ok | T4 s / ok | Wrong taps | Looked first at | Quote |
|---|---|---|---|---|---|---|---|
| P1 | | | | | | | |
| P2 | | | | | | | |
| P3 | | | | | | | |
| P4 (after the fix, that task only) | | | | | | | |
| P5 (after the fix, that task only) | | | | | | | |

**What we changed because of it:** **[fill]** (commit hash, and the line for the slide: "3 people, 4
tasks: T_ __ of 3 → after the fix __ of 2").

Report raw numbers ("2 of 3 in 14 and 22 s"), never percentages from three people.
