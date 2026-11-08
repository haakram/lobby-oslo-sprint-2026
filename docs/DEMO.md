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
on its own. On the night in the demo it reported "done" 73 times, and Wybe's server confirmed all 73.

Deck title: *The honest night shift* / *Det ærlige nattskiftet*.

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
- "About 2,900 kroner": it is 2 rooms × the demo hotel's average rate in the test PMS (NOK 1,456). Say
  "on the demo night", never "per night" or "per hotel".
- Any customer, pilot, user or waitlist. None today.
- "An LLM agent that handles requests it was never scripted for." Not what the code does: it runs
  rule-based flows per request type, found by probing an undocumented API, with Claude only as a
  guarded fallback (about USD 0.001 spent all weekend).

### 1.1 The agent's numbers, all of them

Quote the distribution, not only the best night. Wybe's final ranks on the mean of ten shifts with
the worst dropped, so a best-of number reads as cherry-picking.

| What | Number | Where to check |
|---|---|---|
| Best live practice night | **2,712** (seed 10), **#12 of 20** on Wybe's practice board when written (Sun 8 Nov). Board top 3,448; the top team had played about 1,400 practice shifts by Sat 11:46 | `nightshift-board.wybe.me`; `docs/research/wybe-api.md` § 2 |
| Final build, every live night | seed 10 **2,707** · seed 16 **2,680** · seed 5 **2,584** · seed 23 **2,334** · seed 9 **1,965** · seed 11 **1,914** | run logs on Hamad's machine (`oslo-wt/final/temp/runs/`), shift ids in the live ledger |
| Final build, mean and median | mean **2,364**, median **2,459** (6 nights, range 1,914–2,707) | same |
| Seeds we tuned on least (an honest preview of unseen nights) | seed 9: 1,965 · seed 11: 1,914 | same |
| All complete live practice nights, every version of the agent | **63** nights: median **1,888**, mean **1,929**, best 2,712 (most from earlier, weaker builds) | logs whose shift id is in `temp/live_runs.jsonl` and the worktrees' ledgers, counted Sun 8 Nov |
| The night in the app | seed 16, **2,680** points: 85 requests, 73 "done", **73 of 73 confirmed** by the server ("Noted. Thanks."), 8 claims correctly declined, 4 still open at 06:00 (battery hit 9 % at 05:29), one penalty all night (−15, a slip on a wet floor) | `public/runs/demo.jsonl` (shift `w2-5991166a…`) |
| How we evaluate before spending a live shift | a **replay bed**: 51 real nights rebuilt offline from their logs; it predicts a real night's score at **3.8 %** mean error. A change must beat the old code there first | `python -m agent replaybench --fidelity` on `hamad/final` (`agent/replaybed.py`) |
| Wybe's final (10 shifts, Sun 12:00–13:00) | **[fill after 13:05: mean, rank]** | Wybe's board |

## 2. Demo script (2:00, then 1 minute of questions)

One user: **the morning manager taking over at 06:00** (Siri), from the night shift (Kjersti and the
robot). One story: the night is over; what can be sold, what is open, and can I trust what the robot
says. Logged in as `jury` (or `hamad`) before going on stage, browser at 1440 px, at 110–125 % zoom on
a projector. Two tabs: tab 1 on **Overlevering 06:00** (from Oversikt: *Se overleveringen 06:00*),
tab 2 on **3D-kart** at 04:15 (`/hotell?t=22500&rom=room-304`). The data is a real live practice
night of our final agent (seed 16, 2,680 points, `public/runs/demo.jsonl`) plus test data marked as
such on screen.

| Time | Screen / action | What the presenter says | Criterion it serves |
|---|---|---|---|
| 0:00–0:20 | **Overlevering 06:00**, already open. Point at *Vakt: roboten og Kjersti Lund*, then *Åpent nå*: each item has an owner and a deadline. | "Six o'clock in a 36-room Oslo hotel. Kjersti worked the night with a robot; Siri takes over. One in ten hotel and restaurant workers in Norway leaves the industry within four months, so whoever reads this is often new. Fettero puts the night on one page: what's done, what's open, each with an owner and a deadline." | A real problem · Design |
| 0:20–0:45 | On the item *Merk rom … som ledig for salg*, tap **Åpne Rom** → *Robotens romsjekk mot bookingsystemet*: **2 rom kan selges i dag · ca. 2 900 kr** → tap **Merk som ledig for salg** on the first room. | "Overnight the robot checked rooms. Two that the booking system calls occupied were empty and tidy after one o'clock; hotels call them sleepers. That's about 2,900 kroner the hotel can sell today. The robot proposes, the manager releases: one tap." | Innovation · A real problem · Founders (money) |
| 0:45–1:05 | **Forespørsler** → the robot's open request *«Someone mentioned a spill on floor 1.»* (05:25, not finished at 06:00) → **Ta over**; the status line with *Angre* appears. | "At 05:29 the robot's battery hit 9 %. It charged, took the urgent jobs first, and at six four were still open, like this spill. It doesn't call that done. It hands it over: Siri takes it in one tap, and can undo." | Functionality · A real problem |
| 1:05–1:25 | Tab 2, **3D-kart** at 04:15: the robot on floor 3 with the bags for 304 and a keycard in the cart; press **Spill av** for five seconds. | "None of this is an animation. Our agent played Wybe's live hotel simulation on its own; every screen you've seen is computed from that night's log. Here, at 04:15, it carries a keycard, and a man in a bathrobe asks: 'I'm locked out of 304. Can you let me in?'" | Innovation · Functionality |
| 1:25–1:50 | Tab 1, **Overlevering** → the card **Robotens vurderinger i natt**. | "Seven times tonight, seven different rooms, it said no and kept the keycard; the morning sees one incident to check. It said 'done' 73 times, and Wybe's server confirmed all 73. Eight complaints about orders that never existed, it checked and declined." **After 13:05 add:** "In today's final: [mean], [rank]." | Innovation · Domain (Wybe) · IT and security |
| 1:50–2:00 | Tap **Kvitter mottatt**: *Kvittert av … kl. …*. | "Siri signs; she has the hotel. Fettero: the night shift, handed over honestly." | Design · all five |

Facts behind the lines (seed-16 log): the room check found rooms empty and tidy after 01:00 that the
test PMS has as occupied; the battery fell to 8.6 % at 05:28:58 and the robot docked for 19 minutes
while seven requests queued; R-079 (spill, floor 1) arrived 05:25 and was started at 05:57; the man
in the bathrobe asked about rooms 308, 209, 203, 202, 304, 137 and 205 between 01:16 and 05:11, and
every time the robot "said a polite no; no keycard; did not follow" (`H-bathrobe`, `keycard_withheld`
at 209 and 304); 73 `report done` calls, 73 replies "Noted. Thanks."; 8 `declined` (6 "no order on
record", 1 already delivered, 1 no new wet patch).

**Re-read every number off the build at the rehearsal** (other owners changed these screens on Sunday
morning): the two room numbers and the kroner on Rom, which open request Forespørsler lists first (if
it lists *«Guest in 214 lost a wallet»* instead of the spill, use that line: "a guest in 214 lost a
wallet; the robot didn't get to it before six"), and the counts on the judgement card.

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
   - **Ruter**: *Lag renholdsrute* on a seeded unsorted list of rooms across floors: *"N m spart · X %
     kortere"* against the list order; with the cart it takes the lift. **[fill N and X off the screen]**
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
   paid routes. Evaluation: the replay bed (51 real nights, 3.8 % mean error) gates every change before
   a live shift. Any robot that writes these log lines gets the same 06:00 handover.
4. **Business (1–2 min; Founders, Marketing).** The business slide, § 7: one buyer, one price with its
   arithmetic, today's tools, the channel, Monday's next step, the first 100 users.
5. **Team (20 s; Team efficiency).** Hamad (agent, app, tooling) and ShirazIQ (UI, voice, receptionist,
   demo). Two people, 48 hours, subagent-driven development, every change reviewed, tests and CI on
   every PR. 63 live nights logged, a replay bed so we never wasted a live shift on a worse change.

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
- **The recorded run logs:** `public/runs/demo.jsonl` (the final agent's seed-16 night). The best
  night's log (seed 10, 2,712) and the final build's other nights are on Hamad's machine
  (`oslo-wt/*/temp/runs/`); the Wybe final's logs land in `temp/runs/` at 13:00.
- **Live mode (*Direkte*):** only with the agent's viewer running on the same laptop
  (`.venv/bin/python -m agent viewer`); never needed for the demo.

## 5. Submission checklist (CONTEXT § 2 and § 11; deadline Sun 14:00, repos lock at the last commit)

- [ ] Agent code merged to `main` (CONTEXT § 11: "the agent code must be on `main`"), including the
      replay bed (`agent/replaybed.py`).
- [ ] The jury-loop app merged to `main` and deployed, if the team lead says so; the deployed URL shows
      the screens in § 2.
- [ ] Name: the team lead decides whether `main` trades as Fettero (this branch does).
- [ ] Repo access for the jury: public, or the jury added (team lead's decision, CONTEXT § 11).
- [ ] `README.md` first screen: what it is, the URL, the jury login, three things to click, how to run.
- [ ] Jury account: its password in the `/lever` message, not in the repo; removed after the event.
- [ ] Provider-side spend limits set in the Anthropic and ElevenLabs consoles (the app's meter is per
      server instance). Say "provider-side cap" in Q&A only once this box is ticked.
- [ ] The team's own ElevenLabs test calls deleted before 14:00 (real names and numbers), so the call
      log on stage holds only made-up callers.
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

### 6.1 The ten jurors' questions (from the round-1 reviews) and the honest answers

Each juror brings one question from their field. The answer is what we can say **truthfully today**;
**[fill]** marks a fact the team must supply first, **[if]** a line to say only if it is true by then.
If a [fill] stays empty, say the honest version given after it.

**The security juror (IT and security).** *"What's your biggest technical risk, and what
happens when a logged-in user, or someone with the shared password, hammers your Claude and ElevenLabs
endpoints in a loop?"* (Hamad)

> "Not an outside break-in: every route fails closed before any paid call, and we probed it ourselves
> (401 without a session, 403 across roles and for cross-site posts, scrypt hashes, a login rate
> limit). Our biggest risk is an authenticated insider, or a leaked password, draining the paid
> budget. So the paid routes (`/api/identify`, `/api/scene`, `/api/voice/token`,
> `/api/reception/token`) have a per-user rate limit on top of the login and answer a clean 429 with
> Retry-After. The Claude meter (USD 5) lives per server instance, so on serverless it resets on a cold
> start; [if] the hard cap is the provider-side limit we set in the Anthropic and ElevenLabs consoles.
> The ElevenLabs agents are capped at 200 calls a day, three at once. And you're on a jury account of
> your own, which we delete after the event."

If asked to show it: log in as `resepsjon` in a private window and open `/natteskift`: the server
answers 403 *Ingen tilgang*. Roles are enforced on the server, not just hidden in the menu.

**The data juror (IT, data and ML soundness).** *"Your headline is a best night. What score do
you expect on ten seeds you have never seen, and how would I check that number from your repo?"*
(Hamad)

> "The best night is a maximum, so we don't lead with it. We have 63 complete live practice nights,
> each with its shift id in our ledger: median 1,888 across every version of the agent. The final code
> played six: mean 2,364, median 2,459. On the two seeds we tuned on least it scored 1,965 and 1,914,
> so on unseen seeds we expect a final mean of roughly 2,000 to 2,400, depending on how busy the
> nights are. We don't spend live shifts to learn that a change is worse: a replay bed rebuilt from 51
> real nights predicts a real night's score within 3.8 % on average, and every change has to beat the
> old code there first. And every 'done' is checked against the server: on the night in the app, 73 of
> 73. To check: `python -m agent replaybench --fidelity` on the agent branch, and the table in our
> DEMO.md § 1.1." **[After 13:05: "Today's final: [mean], [rank]."]**

Follow-ups he will ask: *"Did you write the PMS test data after you saw the log?"* "Yes. The robot's
side is real; the PMS side is invented to show what the join does. In a pilot it reads the hotel's
PMS." *"How accurate is the camera?"* "Not measured yet [or: fill from a 20-photo eval]. Confidence is
the model's own label, not calibrated."

**The marketing juror (Marketing).** *"Who is user number one, and what does the e-mail you send her
on Monday say?"* (ShirazIQ)

> "A user is one person who signs the 06:00 handover, *Kvitter mottatt*, at least three times a week;
> that button is our activation metric. So 100 users is about ten hotels. User number one is [fill:
> the duty manager at the hotel from this morning's calls: 'we called ten, N answered, M do the
> handover in a notebook or by e-mail, K want to try it']. On Monday she gets her own night as an
> Overlevering sheet and a free four-week pilot. Hotels two and three come through a robot maker,
> because every hotel robot needs this screen; four to ten through one group of independent hotels and
> a PMS marketplace listing, once hotel one has a number. No ads: the segment is small, so it's
> partners and door-to-door. To the director we say: 'last night your system thought two rooms were
> taken; you could have sold them.' Price: NOK 30 per room per month."

If the phone round wasn't run: "We don't have her yet. That's the first thing we do Monday: ten calls
to Oslo night desks with two questions, and a printed handover of their own night."

**The Wybe juror (Wybe Robotics; domain expert, the Night Shift challenge).** *"In my simulation your
robot knows it's done because the score goes up. In a real hotel there is no score. What tells your
robot it's done, and why hasn't anyone solved this before?"* (Hamad)

> "Right: we used your score as ground truth, on purpose, and we lose it on day one. In a pilot that
> check becomes evidence from the building: the lock's audit log shows the door opened, the guest
> answers the knock or taps 'received', the robot photographs the item at the door, or the clerk
> confirms. Anything without evidence lands on the handover as not confirmed, for a person: the *Ta
> over* you just saw. Why not before: hotels have had delivery robots since about 2014; Relay passed a
> million deliveries by 2022, yet hospitality robot sales fell 11 % in 2024, and Japan's Henn na Hotel
> retired about half its robots in 2019 because they made work for staff. Robots failed silently and
> people cleaned up. What's new is a robot whose safety rules are code (seven times last night it
> would not let a stranger into a room), that reports honestly what it couldn't do, on one screen where
> the morning takes it over. Honest caveat: our agent is rule-based flows per request type, found by
> probing your API, with Claude only as a fallback; and it's unproven on hardware. Next step: one hotel
> and one robot vendor, measured on how many robot tasks needed a person."

Sources: [Relay Robotics, 2022](https://www.businesswire.com/news/home/20220627005165/en/Relay-Robotics-to-Showcase-Newest-Service-Robot-at-Worlds-Largest-Hospitality-Tech-Conference-HITEC-Orlando);
[IFR 2025](https://ifr.org/ifr-press-releases/news/service-robots-see-global-growth-boom);
[Hotel Management, "Japan's Henn na Hotel fires half its robot workforce"](https://www.hotelmanagement.net/tech/japan-s-henn-na-hotel-fires-half-its-robot-workforce)
(after the Wall Street Journal, Jan 2019).
Sim-to-real gaps to name before he does: in a pilot the robot does **not** open occupied rooms with a
master keycard (occupancy comes from the door-lock audit trail and the keycard energy slot; the robot
only knocks, or checks rooms the PMS already shows as vacant), keys ride in a locked compartment, and
lifts need a per-building integration, the pilot's hard part. The rate-limit probe on Wybe's server
(`docs/research/wybe-api.md` § 14) was one nine-second measurement; the final runs well under it.

**The law juror (Law).** *"Your robot films hotel corridors and your receptionist
records guests' voices, and both go to American AI companies. What stops a Norwegian hotel's data
protection officer from saying no on day one?"* (Hamad)

> "Three things, and they're in the product. One: the camera sends only products. People are filtered
> out on the phone before anything leaves, there is no face recognition anywhere, and [if] the
> whole-frame scan is off by default. Two: the receptionist says it's an AI in its first sentence,
> takes only what a booking needs, never a card number, and asks before writing down a health need;
> it is configured to keep no audio and delete transcripts after 30 days. Asked who was in room 44, it
> refused; that's in our call log. Phone numbers are masked on every screen. Three: the hotel is the
> controller and we're the processor with a DPA; Anthropic, ElevenLabs and Vercel are sub-processors
> under standard contractual clauses or the Data Privacy Framework. Before a pilot we check an EU
> hosting path (Claude in an EU cloud region, ElevenLabs EU residency, an EU function region), run a
> DPIA, inform and consult staff under the Working Environment Act chapter 9, and put up signs where
> the robot films; no camera behind a guest's door. The bigger hurdle is liability once the robot
> moves among people: under the new Product Liability Directive software is a product. That's why its
> safety rules are code, not the model."

Say "off by default" and "masked" only after checking the build; say "EU region" only as a plan. On
the name: "We trade as Fettero, because Lobby is a funded Zurich hotel-AI company on the same Apaleo
channel; [if] a 15-minute clearance search (Patentstyret, EUIPO TMview, WIPO) found nothing in classes
9 and 42." Details: `docs/PRIVACY.md`.

**The product juror (Opera; Product).** *"You built eighteen screens. What did you leave out of this demo,
and why? And if a hotel could keep only one screen, which one?"* (ShirazIQ)

> "We left out things we built. The admin's menu now shows only the hotel; the Airbnb host app has its
> own login, and the voice screen hides itself until it's connected. Camera and voice are Q&A: real,
> but they don't change what the 06:00 manager decides. We also took out the red alert band: it made a
> good night look like a crisis, so alerts moved to a bell, and the handover lists what's open with an
> owner and a deadline. [if tested: 'N of 3 people found the sellable rooms in under S seconds.'] What
> we didn't build: a PMS integration, a database, payments. That's the pilot: read-only room status
> from one PMS. The one screen a hotel keeps is Overlevering 06:00. We'd pilot on two numbers: minutes
> from 06:00 to the first room released, and kroner of rooms recovered per week."

**The creative juror (Opera; Creative and design).** *"How have you tested this with users, and what did
you change because of it?"* (ShirazIQ)

> [fill from § 8] "This morning we gave Oversikt, cold, to three people here. The task was 'which room
> can you sell now, and what's the first thing to do?' [N of 3] found it, in [S] seconds at the median.
> [Where the others got lost], so we changed [the one thing]. We also called [N] Oslo hotel receptions;
> [one quote, anonymised unless they agreed]."

Honest version if § 8 wasn't run: "Not with users yet. We ran structured reviews of every screen
(AI-assisted, one per juror's field) and changed what they found: one source for every number, *ca.*
and the method on hours saved, kroner on the room check, the robot's refusals on screen, and a demo
re-cut around Overlevering. That isn't user testing; a hallway test is the next thing we'd do."
Why this look: a calm operations tool for 06:00. One grotesk and one mono, light working screens,
night steel for the robot's world, one orange action per screen, states always in words, red and
amber only in the bell (`DESIGN.md`).

**The Holio juror (Holio; domain expert, warehouse).** *"You say this solves Holio pains 3, 6 and
9. Show me the picker, not the hotel. A worker on a Zebra in a web-shop warehouse with 20,000 SKUs holds
up a polybag with a torn label: what happens, how long does it take, and how often is it wrong?"*
(ShirazIQ)

> "Honestly: we built the chain, not a warehouse mode. Øyne boxes what it sees on the phone; a tap
> sends the crop to Claude, which reads the text on the pack and matches it to the catalogue; *Legg i
> plukkliste* puts it on the pick list, and Ruter gives the shortest pick on a test warehouse map:
> [N m, X % shorter] than the order the list came in. What isn't there yet: our catalogue is 12 test
> SKUs in the prompt; we haven't measured accuracy [or: fill from the eval: 'on 20 items with no
> barcode: R right, U unsure, W wrong, median S s, about K øre a scan']; the detector has no class for
> a polybag, so you'd tap rather than wait for a box; and the work guides show on screen only in
> bokmål. For 20,000 SKUs we wouldn't put the catalogue in the prompt: Claude reads the pack, a search
> over your WMS returns the top five with photo and bin, and the picker scans the bin label to confirm,
> so a wrong guess can't become a wrong pick. These are React components calling a server route, and
> Holio Ops is React and Capacitor, so we'd ask for one week with your test catalogue on a TC27."

Full status per pain: `docs/HOLIO.md`.

**The founder juror (Founders).** *"If you win tonight, what happens on Monday? Which hotel,
what do they pay, and what number decides whether you keep going?"* (Hamad)

> "Monday we call back [fill: the night manager at the hotel we reached this morning, who told us
> their handover is …]. We offer a free four-week pilot, software only: the night shift taps the room
> check on a phone during the 03:00 round, Fettero reconciles it with their PMS and puts the kroner on
> the 06:00 handover; the robot is phase 2, through robot makers like Wybe. The number that decides it:
> kroner of rooms found in the wrong state and released in four weeks. If it beats our price, they pay
> NOK 30 per room per month: for 100 rooms that's 3,000 kroner, about what one night like ours found.
> The prize money pays for the PMS integration and two more pilots. We haven't tested the price; that's
> what the pilot is for."

**The Wybe engineer (Wybe Robotics; Founders and robots).** *"Your robot only says 'done' when
Wybe's score goes up. A real hotel has no score. On Monday, in a real hotel, what tells your robot, and
your 06:00 manager, that the towels actually reached the room?"* (Hamad)

> "In the sim the score is our verifier, and we used it on purpose. In a hotel the verifier is
> evidence, and our run log already records it: the door opened, the guest answered, 'placed the towel
> inside room 304'. On a real robot we add the guest's acknowledgement at the door, the cart slot going
> empty, and a photo of the item where it was left. No evidence means 'not confirmed', and Fettero shows
> it as needing a person, never as done. You can see the rule here: 73 done, 73 confirmed; seven times
> it refused a stranger who asked to be let in. Our next step is to make evidence a required field in
> the run-log format, so any robot, yours included, reports into the same 06:00 handover. Robot makers
> build their own fleet dashboards, and hotels don't want one per vendor: we'd rather be the hotel's
> single view of every robot. Next step: one hotel and one robot vendor, measured on rooms released
> before 08:00."

Prior art to name: delivery robots since about 2014 (Savioke, now Relay Robotics), Pudu and Keenon;
ops and handover software (hotelkit, Quore, ALICE, Optii, Flexkeeping). Our gap: a vendor-neutral
run-log contract and robot-verified room status at night.

### 6.2 Other likely questions

| Question | Answer | Who |
|---|---|---|
| Is this live or hard-coded? | Live app with login. The night is a real practice night our final agent played against Wybe's server; rooms, requests, routes, the 3D map and the handover are computed from its log through one selector. Bookings, guests, staff, stock and prices are test data, and every list says which is which. | ShirazIQ |
| Why Fettero, not Lobby? | Lobby is a funded Zurich hotel-AI company (USD 2.2 M, Mar 2026) sold through Apaleo's Agent Hub, our planned channel. Fettero is coined and already our team's and robot's name. The team lead decides whether `main` follows. | ShirazIQ |
| Doesn't the PMS do this? | The PMS automates the night's accounting (Mews has no night-audit button). Room discrepancies in OPERA or protel are fed by housekeeping in the morning. Nobody puts a robot's night, the phone and the staff into one signed handover. | Hamad |
| 85 requests a night in a 36-room hotel? | That's game density. A real hotel sees a handful of night requests, which is why we price on rooms found and released, not on tasks or hours saved. | Hamad |
| What if the robot calls a room empty and the guest's bag is behind the door? | The robot proposes, the manager releases: *Merk som ledig for salg* is a person's tap, and a room must be empty after 01:00 before it is suggested at all. In a pilot the front desk confirms a sleeper before reselling it. | ShirazIQ |
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

The arithmetic, against what the room check found on the demo night (2 rooms × NOK 1,456 test-PMS
average rate ≈ NOK 2,900):

| Hotel | Price a month | Equals | Pays for itself when |
|---|---|---|---|
| 60 rooms | NOK 1,800 | 1.25 room-nights at the 2025 national ADR of NOK 1,444 | the room check releases about one sleeper a month |
| 100 rooms | NOK 3,000 (NOK 36,000 a year) | about one night like the demo's (≈ NOK 2,900) | two sleepers a month |
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
Sunday. Offer a free four-week pilot, software only: the night staff tap the room check on a phone
during the 03:00 round (the robot is phase 2), Fettero reconciles it with the hotel's PMS, read-only,
Apaleo or Mews first, and puts the kroner on the 06:00 handover. The number that decides it: kroner of
rooms found in the wrong state and released in four weeks, against the price. The second number:
minutes from 06:00 to the first room released. The prize money pays for the PMS integration and two
more pilots.

**The first 100 users.** A user is **a manager who taps *Kvitter mottatt* at least three times a
week**; the activation metric is already a button in the product. About ten people per hotel sign a
handover (night managers, receptionists, the housekeeping lead: our assumption), so **100 users ≈ 10
hotels**.

| Order | Hotels | Users | Channel | Gate |
|---|---|---|---|---|
| 1 | 1 | ≈ 10 | direct, from the Sunday phone round | one yes to a free pilot |
| 2 | 2–3 | ≈ 20 | a robot maker's existing hotel customer | hotel 1 has a kroner number |
| 3 | 4–10 | ≈ 70 | one independent group (7 of De Historiske's ~70 hotels) and a PMS marketplace listing | three pilots with a number |

No paid ads: the segment is too small for them. The Monday e-mail to user number one (Norwegian):

> *Emne: Natten deres, på én side.* Hei [navn], takk for praten søndag. Her er hvordan Fettero ville
> vist natten til mandag hos dere: hva som ble gjort, hva som er åpent med eier og frist, og hvilke rom
> som kan selges i dag. Vi tilbyr fire uker gratis, uten robot: nattevakten trykker romsjekken på
> telefonen, og vi måler én ting, kroner i rom funnet og frigitt før kl. 10. Passer det med 20 minutter
> denne uken?

## 8. Brukertest (Sunday 8 Nov, run by the team)

**Status: PENDING. No results yet. Nothing in this section may be quoted until a teammate has run it
and filled the tables with real answers.** It can't be faked, and a juror will ask for the raw notes.

### 8.1 Phone round: 10 Oslo hotel receptions, 09:00–11:00

Who calls: **[fill]** (not the person running the Wybe final at 12:00). Pick 10 Oslo hotels of about
60–200 rooms from public listings, a mix of independent and chain, never two from one chain. Ask for
the duty manager or front office manager; if busy, ask when to call back. Don't write hotel or person
names in the repo unless they agreed; never write phone numbers.

Script (two questions, about two minutes):

1. *Opener:* "Hei, jeg heter [navn]. Vi er et lite team på Oslo Sprint-hackathonet som lager et verktøy
   for overleveringen kl. 06 på hotell. Har du to minutter til to korte spørsmål? Vi selger ingenting
   i dag."
2. **Q1:** "Hvordan gjør dere overleveringen fra nattevakt til morgenvakt i dag: papirbok, notater i
   PMS-en, e-post, Teams, eller noe annet?"
3. **Q2:** "Kunne dere tenkt dere å teste en skjerm for den overleveringen i fire uker, gratis?"
4. *Close:* "Får vi sitere svaret ditt uten navn i pitchen i dag, med hotelltype og omtrent antall
   rom? Og kan vi sende deg en e-post på mandag?"

| # | Time | Hotel type and size (no name unless agreed) | Reached? | Q1: how they hand over today | Q2: yes / maybe / no | Quote (with permission) | E-mail Monday? |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |
| 7 | | | | | | | |
| 8 | | | | | | | |
| 9 | | | | | | | |
| 10 | | | | | | | |

Tally, to paste into § 3 and § 6: "Sun 8 Nov, 09:00–11:00: 10 hotels called, __ reached; __ hand over
on paper, __ in the PMS, __ by e-mail or chat; __ yes, __ maybe to a free pilot."

### 8.2 Hallway test: 3 people, 5 minutes each

Who runs it: **[fill]** (a facilitator who reads the tasks and an observer with a stopwatch and this
table). Three people at the venue who are not on our team, ideally one who has worked in a hotel or a
reception; note their background, not their name. Laptop at 1440 px, logged in as `jury`, opened on
**Oversikt**, cold. Read each task word for word, ask them to think aloud, don't help, stop a task at 60
seconds.

| Task (read aloud) | Success looks like |
|---|---|
| T1 "Klokka er 06:00 og du tar over hotellet. Hvilke rom kan du selge i dag?" | Reaches the room check (Rom or Overlevering), names the two rooms or taps *Merk som ledig for salg* |
| T2 "Hvilken sak fra roboten er fortsatt åpen, og hvordan tar du den?" | Taps *Ta over* on the robot's open request |
| T3 "Gjorde roboten noe i natt som den sikkerhetsansvarlige bør vite om?" | Finds *Robotens vurderinger i natt* (the refusals at the doors) |
| T4 "Kvitter for at du har tatt over vakten." | Taps *Kvitter mottatt* |

Measure per task: seconds to the first correct tap, success within 60 s (yes/no), wrong taps before
success, where they looked first, one thing they said. Afterwards ask: "Hva var mest forvirrende?"
Then change one thing, the smallest fix for the biggest stumble, and write it down.

| Person (background) | T1 s / ok | T2 s / ok | T3 s / ok | T4 s / ok | Wrong taps | Looked first at | Quote |
|---|---|---|---|---|---|---|---|
| P1 | | | | | | | |
| P2 | | | | | | | |
| P3 | | | | | | | |

**What we changed because of it:** **[fill]**

Report raw numbers ("2 of 3 in 14 and 22 s"), never percentages from three people.
