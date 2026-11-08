# DEMO.md — Demo, pitch and submission

> What the jury sees. Owners: ShirazIQ (script, deck, presenting; the phone round and the hallway test
> go to ShirazIQ because Hamad is at the Wybe final, team to confirm at 09:00), Hamad (agent numbers, Q&A on tech, security and privacy; at the Wybe final
> 12:00–13:00). Rewritten Sun 8 Nov morning against the screens on `hamad/jury-loop` (app, running on
> :3300) and the final agent on `hamad/final`; round 4 (about 04:00–06:00): the real sleeper, the
> recomposed Overlevering, the decided wedge, SSB's room rates. Every claim below is checked against the
> code, a run log or a cited source; anything not yet true is marked **[fill]** or **[if]**. Keep § 2
> in sync with `docs/PRD.md` § 4. Rehearse against a timer, twice, on a laptop that isn't the builder's.
> The product trades as **Fettero** on this branch (the team lead decides whether `main` follows);
> *Hotell Nattskift* is only the demo hotel's name.

## 1. The pitch in one breath

**Fettero is the night shift that reports back. At 06:00 the manager who takes over the hotel gets
the night on one page: what needs a person now and who owns it, which rooms can be sold today and for
how much, and what the night robot did and refused to do. Nothing on it says "done" unless it was
confirmed.** Hotel number one needs no robot: Fettero reads its booking system and its door-lock log.
The robot is how we prove "confirmed" can be measured: our AI agent ran Wybe's live hotel simulation on
its own. On the night in the demo it said "done" 73 times; 64 of those came after it had seen the
simulator's score rise, and **9 rested on its own judgement (5 room checks, 4 spills): 9 of 9
credited**. Over the final branch's 18 live nights, 185 of its 189 own-judgement claims were credited
(97.9 %), room checks 117 of 117.

The one line, as on the login screen and the first slide: ***Natten, ærlig overlevert.*** (the night,
handed over honestly). One sentence after it, the one in `src/ui/brand.ts` (`DESCRIPTION`), which since
round 4 works without a robot: *Morgenvakten på hotellet får natten på én side kl. 06:00: rom som kan selges, det som er åpent med eier og frist, og hva som faktisk ble gjort, fra nattevaktens notater og eventuelt en robot.* The robot then proves the claim on stage instead of being a precondition for buying.

Why it matters (sourced; use one or two on the hook slide, never all):

| Figure | Source |
|---|---|
| Even in a normal year, **under 11 %** of the people who had worked in Norwegian accommodation and food service every month from Nov 2018 to Feb 2019 had left the industry by **June 2019** (8,400 people in four months). About **40 %** of the stable workforce works part-time. The person reading the handover is often new. | SSB analyse 2023/9, ["Mange vendte ikke tilbake til overnatting og servering etter koronapandemien"](https://www.ssb.no/arbeid-og-lonn/sysselsetting/artikler/mange-vendte-ikke-tilbake-til-overnatting-og-servering-etter-koronapandemien), 6 Nov 2023 |
| Norwegian hotels sold **18.5 million room-nights** in 2025 at an average **NOK 1,471 a room**, with **57 %** of rooms sold (RevPAR NOK 842). **In Oslo: NOK 1,631 a room, 72 % sold** (RevPAR NOK 1,170). An Oslo room that stays blocked tonight is about NOK 1,600 not earned on a night the rest of the hotel sells. | SSB statbank, [table 14169](https://www.ssb.no/statbank/table/14169) (*Omsetning og kapasitetsutnytting på hotell*, 2025, published 4 Feb 2026; read through SSB's API Sun 8 Nov). Hotelloversikten's sample of about 70,000 rooms gives NOK 1,444 and 62.5 % for 2025 ([årsrapport 2025](https://www.nhoreiseliv.no/contentassets/5a59760d339f4bac884b462f804aeea7/hotelloversikten-arsrapport-2025.pdf)); quote SSB, the full count |
| Norway has **92,678 hotel rooms in 1,079 open hotels** (Sep 2026): **about 86 rooms a hotel**, so our 60–200-room band is the typical hotel. Oslo: 14,997 rooms in 81 hotels. | SSB statbank, [table 14164](https://www.ssb.no/statbank/table/14164) (open establishments and rooms, hotels and similar, monthly; 86,565 in Jan 2025, 93,871 in Jul 2026) |
| **91 %** of hotel chains use AI, but only **13 %** report measurable ROI (113 chains, 8,200+ properties). A tool that shows its own arithmetic stands out. | [h2c AI Opportunity Study 2026](https://www.hospitalitynet.org/news/4134680/new-h2c-study-ai-adoption-is-widespread-among-hotel-chains-but-enterprise-readiness-remains-limited), 1 Oct 2026 |
| Norwegian hotels sold **26.7 million guest nights** in 2024, a record; foreign hotel nights grew **14 %**. More guests who don't speak Norwegian. | SSB, ["2024 ble det beste året nokon gong for norske overnattingsstader"](https://www.ssb.no/transport-og-reiseliv/reiseliv/statistikk/overnattingar/artikler/2024-ble-det-beste-aret-nokon-gong-for-norske-overnattingsstader), 4 Feb 2025 |
| Modern PMSs removed the night audit itself: Mews has "no 'perform night audit' button". The accounting of the night is automated; the human handover isn't. | [Mews blog, night audit automation](https://mews.com/en/blog/hotel-night-audit-automation) |
| Professional service robots sold rose 24 % in 2025, but **hospitality robots fell 11 % in 2024**. The robot isn't the bottleneck; the software that gives it hotel work and checks it is. | [IFR World Robotics 2026](https://ifr.org/img/worldrobotics/Executive_Summary_WR_2026_-_Service_Robots.pdf), [IFR 2025 press release](https://ifr.org/ifr-press-releases/news/service-robots-see-global-growth-boom) |
| Hotels "can lose or discard around **15 % to 20 %** of linen products before the end of their useful life" (TRSA research, cited). No reliable global benchmark exists, so say "up to one in five". | Hotel Management Network, ["When guests take towels, robes and more"](https://www.hotelmanagement-network.com/features/when-guests-take-towels-robes-and-more-how-hotels-can-tackle-inventory-shrinkage/), 25 Aug 2026 |
| In warehouse picking, "travel time can account for **50 % or more** of total order picking time" (Holio slide only). | Supply Chain Digest, [Cliff Holste, "Routing & Slotting Strategy"](https://www.scdigest.com/experts/Holste_14-03-12.php?cid=7902), 12 Mar 2014 |

**Not said** unless it becomes true:

- What hotels do at 06:00, or that they want this: only what the Sunday phone round finds (§ 8), with
  the date and the count. Today we have talked to no hotel.
- Hours saved: never as a measurement, and not on the hotel's first screen (round 4 took *Timer
  spart* off Oversikt). Where an estimate remains, it says *ca.* and *Slik regner vi*.
- "About 1,500 kroner": it is one room (213) × last night's average rate in the test PMS (NOK 1,467,
  rounded on screen to *ca. 1 500 kr*; *Slik regner vi* shows the method, with SSB's Oslo rate beside
  it), and only after the desk confirms. 213's guest was **due out yesterday (7.11)** and the check-out
  was never recorded, so the booking system still has him in house and holds the room tonight: without
  the release it would stand unsold. It is gross room revenue, extra only on a night the rest of the
  hotel sells (Oslo sold 72 % of its rooms in 2025). Say "on the demo night", never "per night" or "per
  hotel".
- A room whose guest is **due out today** is not a sleeper: every PMS already sells it tonight. What
  finding it empty early buys is an early clean and an early check-in, not a room-night.
- That a real robot would open a booked room. It did in Wybe's simulation; in a pilot the evidence for
  213 is the door-lock log (no entry since the evening) and the energy slot, and the robot only checks
  rooms the booking system shows as vacant.
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
on Hamad's laptop (`oslo-wt/*/temp/runs/`), not in the repo; only `public/runs/demo.jsonl` is. Read from the ledger as
regenerated at 04:08 Sun (229 live starts; the all-nights rows move as nights are logged).
Board tests, the seed-specific experiments in the `lottery`, `lottery2`, `lafinal`, `lawet` and `wetoff`
checkouts (53 full nights started 02:37–04:02, 52 of them on seeds 10 and 16), are `kind=board-test`
in `ledger.csv`: their commit is the checkout's HEAD, not a build, so they are not in `builds.csv` or
any build row below (the rule is in `scripts/ledger.py`'s docstring). The first three builds and the
precision were also recomputed independently from the logs (score before and after each `report`),
with the same result.

| What | Number | Where to check |
|---|---|---|
| Build `d4e445c`, Sun 00:23–00:39 | seed 10 **2,707** · 16 **2,564** · 23 **2,254** · 5 **2,492** · 9 **1,965** · 11 **1,914**: mean **2,316**; tuned seeds 2,504; seeds 9 and 11 (never tuned on) **1,940** | `builds.csv` row `d4e445c` |
| Build `cb72845`, 01:07–01:14 | seed 10 **2,707** · 16 **2,680** · 23 **2,334** · 5 **2,584**: mean **2,576** | `builds.csv` row `cb72845` |
| Build `8eac151`, 01:50–01:58 | seed 10 **2,760** · 16 **2,679** · 23 **2,240** · 5 **2,559**: mean **2,560** | `builds.csv` row `8eac151` |
| Build `c3801e0`, 03:26: the head of `hamad/final` at 03:30 (`8eac151`'s agent plus the end-of-night battery guard and a spill look) | seed 10 **2,760** · 16 **2,748** · 23 **2,298** · 5 **2,559**: mean **2,591**. Not played on seeds 9 or 11 | `builds.csv` row `c3801e0` |
| **Forecast for the final** (mean of the best 9 of 10 unseen seeds, `c3801e0`) | **median 2,035, 80 % between 1,898 and 2,186.** Model: log score = build + seed, least squares over 63 build×seed cells of complete live build nights (18 builds, 20 seeds, residual SD 0.065), then 20,000 simulated finals. **Why lower than the tuned nights (2,591): mostly seed difficulty.** The four seeds this build played are easy (+19 % against the average seed; the unseen ones −4 %), which alone is −19 %; the tuning penalty we can measure is −6 %, from two nights (leave-seed-out on `d4e445c`: seed 9 predicted 1,869, played 1,965; seed 11 predicted 2,254, played 1,914). Sensitivity: no penalty 2,154, penalty doubled 1,923. Committed 04:08 Sun, before the final; the replay bed screened changes on all 20 seeds, so the final is the only true holdout | `docs/runs/forecast.txt` (`python3 scripts/forecast.py`) |
| "Done" credited, 18 nights of these four builds | **1,263 of 1,267 (99.7 %)**; the 4 not credited were all on seed 23, one per build | `builds.csv`: `done_reports`, `done_credited` |
| What each "done" rested on, same 18 nights | **1,078** sent after the agent had seen the score rise during the task (credited by construction: the simulator's verifier, not trust). **189 on the robot's own judgement, 185 credited (97.9 %)**: room checks **117 of 117**, spill reports **68 of 72**. The 4 misses are one probe (R-037 on seed 23, a sign on another request's patch) repeated in all four builds, because what the agent learns resets every shift | `builds.csv`/`ledger.csv`: `done_after_rise`, `done_own`, `done_own_credited`, `done_room_check*`, `done_spill*` (the rule in `scripts/ledger.py`; the app's `doneBasis` runs the same rule) |
| Declines, same 18 nights | 112 declined; the referee credited **93** (+5 each) and gave **19** nothing | `builds.csv`: `declines_credited`, `declines_not_credited` |
| Best practice score on the board | **2,807**, **#8 of 20** at 04:10 Sun, level with the team below us (top 3,448; we played 242 practice shifts, the leader 1,556). It came from a board test (the `lottery` checkout, `d7040b7`, seed 10, 03:38), so it is **not** the final build; the final branch's best (2,760, `8eac151` and `c3801e0`) would rank #11 | `nightshift-board.wybe.me/data`; `ledger.csv`, `kind` `board-test` |
| All full live nights, every version | **120** nights that ran to 06:00 by 04:08 (4 more stranded). Builds: **67**, Sat 13:15 – Sun 03:26, median **1,960**, mean **2,030**, most from earlier, weaker builds. Board tests: **53**, Sun 02:37–04:02, mean **2,753**, best **2,807**, on the seeds they were tuned for (42 on seed 10). Moves as nights are logged | `ledger.csv`, `end_reason` "server ended: time", `kind` |
| "Done" credited, every live night with a log | **8,156 of 8,191 (99.6 %)**, 130 nights at 04:08, every version: every build night with a log, and board tests only when they ran the full night; on the robot's own judgement **1,113 of 1,145 (97.2 %)**, room checks 657 of 662 (the figures behind *Slik vet vi det* on the judgement card; recomputed from the ledger on every build, so they move) | `ledger.csv`: `done_reports`, `done_credited`, `done_own*`, `kind` |
| The night in the app | seed 16, **2,680**, build `cb72845`: 85 requests, 73 "done", **73 of 73 credited** ("Noted. Thanks."): **64 after the score rose, 9 on its own judgement (5 room checks, 4 spills), 9 of 9 credited**; 8 declined, 7 credited (6 orders that never existed, 1 already delivered), 1 not (R-036, a spill report on floor 3); 4 still open at 06:00 (battery 8.6 % at 05:28:58); one penalty all night (−15, slipped on a wet floor in corridor 2B at 23:51) | `public/runs/demo.jsonl` (shift `w2-5991166a…`) |
| How we test a change before a live shift | a **replay bed** rebuilds every full live night offline (72 when we ran it at 02:55). Replayed with the code that played them, 50 nights land within **61 points (3.2 %)** of live on average, 48 of 50 within 10 % (the first 40: 72 points, 3.8 %, the figure we quoted before). **In-sample**: the reward model was fitted on 50 nights that include these | `docs/runs/replay-fidelity.txt` (from `python -m agent replaybench --fidelity`; `agent/replaybed.py` on `hamad/final`) |
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

- Across all 72 nights it held at 02:55 the bed gains **+11.6 a night**, averaged per seed (+16.2 per night; 13 of 20
  seeds better, 6 worse). That is why the change stays on for the final.
- Live, on the four seeds it played, it came out **−17 a night** against `cb72845` (+53, −1, −94, −25).
- Replaying only those four seeds, the bed said −16 at 02:40, and −5 at 02:55 once two newer nights of
  those seeds joined.

Four live nights can't separate a change worth ±20 a night. We keep a change when it wins across 20
seeds in the bed and doesn't strand, and we say the live check is noise at this size.

## 2. Demo script (2:00, then 1 minute of questions)

One user: **the morning manager taking over at 06:00** (Siri Haugen), from the night shift (Kjersti and
the robot). One story: the night is over; what needs a person, what can be sold, and can I trust what
the robot says. **One tab, one page: Overlevering 06:00**, scrolled from top to bottom; no navigation.
Since round 4 the page reads in the order the manager works: *act → evidence → sign*. The figures on
top (held back, the money, safety, the robot), then *Åpent nå* in the wide column (safety first, then
209 held back and 213 to sell) with *Dette skjedde i natt* narrow beside it at 1440 px (at 125 % it
moves below, folded to the night clerk's note), then *Robotens vurderinger i natt*, and *Kvitter
mottatt* last. The proof text (the referee, the ledger) sits behind *Slik vet vi det*. Before going on stage: § 4.1. The data is a real live practice night of our agent (seed 16,
2,680 points, build `cb72845`, `public/runs/demo.jsonl`) plus test bookings, each marked *Testdata:
bookingen er lagt inn av teamet* on screen.

**Timed on :3300 at Sun 04:16 as `siri`**, at 1152×720 (1440 px at 125 %, the projector) and at
1440×900, in a clean browser (Playwright): the page shows *Åpent nå* 0.3–0.4 s after the address is
opened; *Bekreft med resepsjonen* → *Merk som ledig for salg* answers in under 0.1 s, the release in
under 0.1 s, *Kvitter mottatt* in under 0.1 s. The page is 2,951 px tall at 1152×720 (4.1 screens) and
2,713 px at 1440×900 (3.0). **Three scrolls and three taps**: top → *Åpent nå* (the safety items, 209
and 213 with its button all on one screen at both sizes) → *Robotens vurderinger i natt* (the refusals,
*9 av 9* and *10 av 15* on one screen) → the end, *Kvitter mottatt*. Speech: 227 words with the numbers
read out, at 150 words a minute plus 0.7 s a tap and 1.5 s a scroll: **1:37; 1:51 at a calmer 130
words a minute**. After 13:05 the final's score line adds about 4 s, so there are 5–20 s of slack for
one stall.

| Time | Screen / action | What the presenter says | Criterion it serves |
|---|---|---|---|
| 0:00–0:23 | **Top of Overlevering.** Point at the first figure, **1 rom · Holdt tilbake fra salg · Rom 209: dobbelt tildelt?**, then **ca. 1 500 kr · Kan selges etter bekreftelse · Rom 213 · ellers usolgt i natt**. (58 words) | "Six o'clock at an Oslo hotel. Siri takes over from the night shift, and she's often new. Fettero gives her the night on one page. First, what it held back: at 05:16 the robot carried an arriving guest's suitcase into 209, still booked to someone else. Fettero stopped that sale before anyone got a key." | A real problem · Innovation · Design |
| 0:25–0:45 | **Scroll once to *Åpent nå*.** The three wet floors (2B: *Roboten skled der*; 3D: *Roboten flyttet skiltet herfra*), *Vaktmester / renhold · innen 06:30*; the man in the bathrobe, *Sikkerhet / resepsjon*; then 209 with *Fettero holdt rommet tilbake*, and 213. Point at the mono label *Testdata: bookingen er lagt inn av teamet* and the line *I en pilot: dørlåsloggen og energibryteren. Roboten går ikke inn i rom som er booket.* (50 words) | "What needs her now: three wet floors without a sign, one where the robot slipped, and a stranger who tried seven doors, each with an owner and a deadline. The bookings are our test data; in a pilot the door-lock log tells us, not a robot in a guest's room." | Law (care, and no entry into booked rooms) · Wybe (domain) · Design |
| 0:45–1:04 | **Same screen, on 213:** tap **Bekreft med resepsjonen**, then **Merk som ledig for salg**. The row turns to *Rom 213 er lagt ut for salg i dag (ca. 1 500 kr)* with *Ledig for salg · Siri Haugen · nå* and *Gjort i dag*; *Åpent nå* drops from 9 to 8. (43 words) | "Then the money. 213's guest was due out yesterday and nobody recorded the check-out, so the system still holds the room tonight. The desk confirms he's gone; Siri releases it: about 1,500 kroner that would otherwise stand unsold." | Founders (money) · A real problem · Functionality |
| 1:05–1:30 | **Scroll to *Robotens vurderinger i natt*:** *Sa nei 7 ganger til en ukjent person* (seven time-and-room chips, 01:17–05:11); **9 av 9 «Ferdig» på robotens egen vurdering** (*5 romsjekker og 4 søl … De andre 64 meldte den først etter at simulatoren hadde bekreftet arbeidet*; *I et ekte hotell bekrefter låsloggen og robotens foto «ferdig». Ett signal alene står som «ikke bekreftet».*); **10 av 15 Innganger med nøkkelkort uten å banke på**. (61 words) | "Every line comes from our agent's real log in Wybe's live simulation. Seven times a stranger asked it to open a room; seven times it said no. Of its 73 'done', 64 came after the simulator confirmed the work; the 9 it judged on its own all held. And it shows its faults: ten master-key entries without a knock." **After 13:05 add:** "In today's final: [mean], rank [N]." | Innovation · IT and security · data (the data juror) · Wybe (the Wybe juror) |
| 1:31–1:38 | **Scroll to the end:** tap **Kvitter mottatt** → *Kvittert av Siri Haugen · nå · Natt til søndag 8. november er overlevert, med 8 åpne saker. Kvitteringen er lagret på denne enheten.* (15 words) | "Siri signs; she has the hotel. Fettero: *natten, ærlig overlevert*. The night, handed over honestly." | Design · all five |

Facts behind the lines (seed-16 log, `public/runs/demo.jsonl`, and the test bookings): the robot carried
bags into 209 for three arrivals at 01:29, 04:35 and 05:16, for requests that say "the guest checks in
later", while the team's test booking system has Hiroshi Sato in 209 until 9.11 (the simulator's own
night manager said 209 was for the arrival: the "double allocation" exists because of our test data,
which is why the row is labelled and says *Fettero* held it back). 213: the test booking has Ola
Nygård due out 7.11, check-out never recorded (`checkoutMissing` in `src/features/guests/testData.ts`),
so the room is held as in-house tonight; the robot found it empty and tidy at 04:24 (`room_status`). The
robot slipped in corridor 2B at 23:51:33 (−15, the night's only penalty) and crossed that wet floor 27
more times without signing it; at 04:38 it moved the sign from 3D (still wet) to 3C (`sign_moved`); 1C
was wet without a sign at 06:00. The man in the bathrobe asked about rooms 308, 209, 203, 202, 304, 137
and 205 between 01:17 and 05:11; every time the robot refused, and at 209 and 304 it waited to unlock
until he had gone (`keycard_withheld`). Of 15 master-key entries, 5 came after a knock. 73 `report
done`, 73 replies "Noted. Thanks."; 64 after the score rose during the task, 9 on the robot's own
judgement (5 room checks, 4 spills), all 9 credited (`doneBasis` in `src/features/nightshift/`, the
same rule as `scripts/ledger.py`). 8 `declined`, of which the score rose after 7 and not after R-036 (a
spill report on floor 3). Behind *Slik vet vi det* on the card: every live night with a log, every
version, board tests only when complete: 8,156 of 8,191 "done" credited over 130 nights (99.6 %), on
its own judgement 1,113 of 1,145 (97.2 %), room checks 657 of 662, read at 04:15 (it moves as nights are
logged); the final branch's 18 nights: 185 of 189 on its own judgement (§ 1.1). Bags for three arrivals
in 212 and two in 304 are an open item (*Flere ankomster i samme rom: sjekk med resepsjonen*).

**Re-read every number off the build at the rehearsal** (other owners may still change these screens):
the kroner, the count in *Åpent nå*, the order of its first four items, and the card's figures.

Rules for the presenter: don't explain the navigation; stay on this one page; don't open Øyne, Stemme,
Resepsjon, Forespørsler, the 3D map or the host view in the 2 minutes (they are Q&A answers and the 5–10
minute final, § 3); if a screen stalls for 3 seconds, say the line and move on. Use half-screen scrolls
at 125 %: a full PageDown from the top hides 2B's line while you're saying it. For a non-Norwegian
juror, say the three on-screen phrases once with their meaning: *Kan selges etter bekreftelse* (can be
sold once confirmed), *Åpent nå* (open now), *Kvitter mottatt* (sign for it). Q&A openers on the same
page: *Åpne Forespørsler* on the robot's four hand-backs opens Forespørsler, where *Roboten ga videre*
is pinned first; *Se robotens vurderinger* on the stranger item jumps to the card; *Slik vet vi det*
opens the referee and the ledger line for the data juror and the Wybe juror.

## 3. Pitch outline for the final (5–10 min, top 10 at 18:00)

Each juror scores from their own field (CONTEXT § 11). Every part names the field it answers.

1. **Problem, story first, then money and safety (1 min; Real problem, Founders, Marketing).** "Last
   night the robot carried an arriving guest's suitcase into room 209, which the booking system still
   had booked to someone else. Fettero held the room back before anyone was handed a key. It also found
   213 empty: the guest was due out yesterday and nobody recorded the check-out, so the system still
   blocked the room. About 1,500 kroner, sold once the desk confirmed. And three wet floors without a
   sign each had an owner at 06:00." Then one SSB figure (staff churn) and SSB's Oslo rate (NOK 1,631 a
   room-night in 2025, 72 % sold; table 14169). Then, inside the first 20 seconds of the business part:
   "Hotel number one needs no robot: we read the booking system and the door-lock log." Then what we
   heard on the phone this morning (§ 8) **[fill; if the round wasn't run, say "we haven't asked a
   hotel yet; that's step one"]**.
2. **Live demo (3–4 min; Functionality, Design).** The § 2 story, then the extras the 2 minutes skip:
   - **Ruter** (Holio pain 6): *Renhold* opens on today's rooms to clean. At 04:16 the screen said *260 m
     · ca. 8 min for 7 rom*, **as short as room-number order** (*like kort*), and 286 m in the order the
     rooms come free, so 26 m or 9 % shorter than that, with 3 fewer lift trips; with the cart it takes
     the lift, never the stairs. (It was 8 rooms and 268 m before 213 became a real sleeper: a room the
     system still holds as in-house is no longer on today's cleaning list until it's released.) Say it
     plainly: in a 36-room hotel the route isn't where the money is. The *Plukkliste* tab: an example restocking order
     on the test warehouse map, **16 m or 10 % shorter than a list sorted by shelf** (32 % against the
     list as written, shown beside it), and the four work guides as cards in Norsk, Polski, Українська
     and English. Re-read both off the screen.
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
   a live shift; it reproduces a night within 3.2 % with the code that played it (in-sample, § 1.1).
   "Done", split by what it rested on: over the last 18 live nights, 1,078 sent after the score rose
   (the simulator's verifier), and 185 of 189 on the robot's own judgement credited (97.9 %), room
   checks 117 of 117. The forecast for the final (median 2,035, 80 % 1,898–2,186) was committed before
   it. The page itself has no language model in it: every line is a projection of logs, so it can't make
   anything up. The run-log contract is a file, `docs/runlog.schema.json` [if committed by then]: any robot that writes these lines gets the same 06:00 handover [if the *Kilde* switch has landed: 'and here is an Open-RMF sample on the same page'].
4. **Business (1–2 min; Founders, Marketing).** The business slide, § 7: one buyer, one price with its
   arithmetic, today's tools, the channel, Monday's next step, the first 100 users.
5. **Team (20 s; Team efficiency, Founders).** Hamad (agent, app, tooling) and ShirazIQ (UI, voice,
   receptionist, demo, and the customers: the calls from Monday are ShirazIQ's). Two people, 48 hours,
   subagent-driven development, every change reviewed, tests and CI on every PR. Every live night logged
   and pinned to a shift id, and a replay bed to screen changes before a live shift. "We built thirteen
   screens and show one; the cut list is in the PRD." The commitment and the stop rule: **"We both work
   on this full-time for four weeks from Monday. If fewer than 2 of 10 hotels take a free pilot by
   8 December, we stop the hotel wedge and test selling through robot makers."**

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
- **The recorded run logs:** `public/runs/demo.jsonl` (seed 16, build `cb72845`). The final branch's
  other nights (best: seed 10, 2,760, `8eac151` and `c3801e0`) and the board's best (2,807, a board test in the `lottery` checkout) are
  on Hamad's machine (`oslo-wt/final/temp/runs/`, `oslo-wt/lafinal/temp/runs/`); the Wybe final's logs
  land in `temp/runs/` at 13:00.
- **Live mode (*Direkte*):** only with the agent's viewer running on the same laptop
  (`.venv/bin/python -m agent viewer`); never needed for the demo.

### 4.1 Stage checklist (before walking up)

The login limiter counts failed tries per address: 5 per address and user and 20 per address in 5
minutes (`src/features/auth/rateLimit.ts`). On venue wifi every juror shares one public address, and
three jurors were locked out for minutes during the night's reviews. So nobody types a password on stage.

- [ ] **Log in on the demo laptop before going on stage**, as `siri`, in the browser that will be on
      the projector; open Overlevering, at the top, zoom set (1440 px at 110–125 %).
- [ ] **A second tab, already logged in,** on Overlevering in the same browser (same session cookie;
      12 h). If the first tab stalls, switch tabs; never log in again live.
- [ ] **Backup account, logged in in a second browser** (or a private window): `hamad`, on Overlevering.
      If `siri` is locked out, present from it (the stamps then read Hamad's name; say so).
- [ ] Clear rehearsal ticks: *Angre* on 213 and on the sign-off, so the page starts unreleased and
      unsigned (they live in this browser's `localStorage`).
- [ ] Tell jurors who try the `jury` account to type carefully: their mistakes count against the same
      address as the presenter's.
- [ ] Recorded video (§ 4) open in a third window, paused on frame one.

## 5. Submission checklist (CONTEXT § 2 and § 11; deadline Sun 14:00, repos lock at the last commit)

- [ ] Agent code merged to `main` (CONTEXT § 11: "the agent code must be on `main`"), including the
      replay bed (`agent/replaybed.py`).
- [ ] The jury-loop app merged to `main` and deployed, if the team lead says so; the deployed URL shows
      the screens in § 2. Until then the only public deployment (`lobby-sandy.vercel.app`) serves `main`: the old name
      *Lobby* and an older CSP without `connect-src` (curl, Sun 02:50). A security juror will curl it;
      the README says so, and the demo runs from the laptop.
- [ ] Name: the team lead decides whether `main` trades as Fettero (this branch does). The trademark
      search (Patentstyret, EUIPO TMview, WIPO; classes 9, 42, 43; the Ferrero question) is still to
      do: `docs/PRIVACY.md` § 9.
- [ ] The ElevenLabs receptionist's live retention checked in the dashboard and dated in
      `docs/PRIVACY.md` § 4 (team).
- [ ] The forecast (`docs/runs/forecast.txt`) committed **before 12:00** with its timestamp, and after
      13:05 "forecast X (80 %: a–b) · actual Y" added to § 1.1 (the data juror).
- [ ] A team e-mail address for the print footer and the README (the founder juror, the marketing juror: a leave-behind nobody
      can reply to doesn't do its job). None exists yet; don't invent one.
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
- [ ] `/lever` typed in #general with team, repo, one-line description and the jury login, and **no
      URL until this branch is deployed** (the only public URL serves `main` under the old name);
      `/min-innlevering` checked; `/lever` again after any change. Suggested text (owner B): "Team
      Fettero · repo https://github.com/haakram/oslo-sprint-26 (branch `hamad/jury-loop`; which branch
      is judged is the team lead's call) · demo runs live from our laptop · Fettero: *Natten, ærlig
      overlevert.* Morgenvakten på hotellet får natten på én side kl. 06:00: rom som kan selges, det som
      er åpent med eier og frist, og hva som faktisk ble gjort, fra nattevaktens notater og eventuelt en
      robot. · jury login: jury / [password in the message only]".
- [ ] All files committed and pushed before 14:00, with a 15-minute buffer. Nothing merged in the
      last hour unless the presenter agrees.
- [ ] Recorded demo video on two laptops (§ 4).
- [ ] API credit left on Anthropic and ElevenLabs; the jury login tested in a private window, on a
      phone and on a second laptop.

## 6. Judge questions

### 6.1 The jurors' questions (round-3 reviews, Sun 8 Nov about 04:00) and the honest answers

Each juror brings one question from their field. The answer is what we can say **truthfully today**;
**[fill]** marks a fact the team must supply first, **[if]** a line to say only if it is true by then,
**PENDING** a result still being measured. If a [fill] stays empty, say the honest version given after
it. The creative juror and the design juror share a field and both ask the testing question: give both the same numbers.

**The security juror (IT and security).** *"I just curled your production login page: it
serves a weaker CSP than the build you're showing me, with no `connect-src`. What's your biggest
technical risk, and why should I trust the hardened one?"* (Hamad)

> "You're right, and the README and PRIVACY.md say so: the public URL serves `main`, Saturday's build
> under the old name. The hardened headers are on the branch we're demoing, which our team lead keeps
> off `main` until he has reviewed it. [if redeployed: 'We redeployed at [time]; here's the header
> live.'] On this build the policy starts from `default-src 'self'`; `connect-src` allows only our
> origin and ElevenLabs; `object-src 'none'`, `frame-ancestors 'none'`, no `eval` in production;
> `'unsafe-inline'` stays because Next.js streams page data as inline scripts, and a per-request nonce is
> the next step. Our biggest technical risk is cost on the paid AI routes, so we defend it in layers.
> The proxy rejects anyone without a session before any provider is reached. A per-user limit fires
> before any Claude or ElevenLabs call: identify stops at 40 a minute, then a 429 with Retry-After, and I
> can trip it on screen with empty requests that never reach Claude. [if set in both consoles: 'And the
> hard ceiling is a provider-side spend cap at Anthropic and ElevenLabs, because the first two live per
> server instance and reset on a cold start.'] [if not set: 'The provider-side cap is the one layer not
> set yet; until it is, our ceiling is per server instance.'] Authorization is enforced in the proxy,
> not the client; watch: admin, view as robot, open Oversikt, and the server answers 403. Before a
> pilot: limiters in a shared store and per-session revocation, both written up as known gaps."

Show it (10 seconds, his suggested moment): as `siri` (admin), switch the view to *robot* and open
`/oversikt`: the server answers 403 *Ingen tilgang*. If he decodes the session cookie: "signed, not
encrypted; nothing secret inside; change one byte and the HMAC check rejects it."

**The data juror (data and ML soundness).** *"Your robot reads the referee's score before it says
'done'. Take those out: how often is it right on its own judgement, and what does that predict for a
hotel where there is no referee?"* (Hamad)

> "64 of the 73 'done' on this night came only after the score had risen. That's the simulator's
> verifier, and we don't count it as trust. 9 were the robot's own judgement: 5 room checks, where it
> looked inside and reported what it saw, and 4 spill reports. All 9 were credited. Over the final
> branch's 18 nights that's 189 claims on its own judgement and 185 credited, 97.9 %; room checks 117 of
> 117. The 4 misses are one deliberate probe, the same request on seed 23 (R-037) in all four builds,
> because what the agent learns in a shift resets every shift. In a hotel there's no score, so the
> room-check path is the one that carries over: 'done' needs an observation, and that's the path with
> the clean record. Both lines are on the judgement card, and the columns are in `ledger.csv`. On the
> score: we committed a forecast before the final, from a build-plus-seed model fitted on every complete live build night (`scripts/forecast.py`, output in `docs/runs/forecast.txt`): a median of **2,035, with 80 % between 1,898 and 2,186**. It's lower than the 2,591 this build scored on its tuned seeds mostly because those seeds are easy: seed difficulty alone accounts for about −19 %. The tuning penalty we can measure is about −6 %, from two nights, so treat it as rough. [After 13:05: 'The final came in at [Y].']"

Follow-ups he may ask:

- *"Did you write the PMS test data after you saw the log?"* "Yes, and each of those rows says so on
  screen (*Testdata: bookingen er lagt inn av teamet*). The robot's side is the real log; the bookings
  show what the join does. In a pilot it reads the hotel's booking system."
- *"Your holdout is used up."* "Yes. The replay bed screened changes on all 20 seeds, 9 and 11
  included, so for the build that plays at 12:00 no seed in the ledger is untuned. The final is the only
  true holdout, which is why the forecast is committed before it."
- *"The sim is deterministic."* "Yes: the same code on the same seed scores the same, so a per-seed
  difference between builds is exact and the uncertainty is between seeds. `cb72845` → `8eac151` was
  +53, −1, −94, −25 on four seeds: a mean of −17 with a standard error of about 31. Four nights can't
  separate ±20."
- *"Show me a bad night."* Seed 23 is our worst: even there, 70 of 71 'done' credited on the build in
  the app (`cb72845`), and the one that wasn't cost −30.
- *"How accurate is the camera?"* "Not measured. The confidence is the model's own label, not
  calibrated." [or: fill from a 20-photo eval]

**The marketing juror (Marketing).** *"How will you get your first 100 users, and since your user is
someone who taps Kvitter mottatt, which today is saved in one browser, how will you know when you have
them?"* (ShirazIQ)

> [fill from § 8.1, raw numbers only] "Hotels first, software only. This morning we called [10] Oslo
> hotels of 60–200 rooms and reached [N]; [M] hand over in a notebook or in PMS notes, [K] said yes or
> maybe to a free four-week pilot, and the phrase they used most was '[their words]'. They told us
> [3–6] people sign the morning handover, so 100 users is about [20] hotels. Hotel one is [type and
> size]; they get a printed Overlevering of their own night on Monday. Hotels two to five come from
> independents through VisBook and De Historiske; robot makers come after: we asked Wybe at their stand
> and they said [answer]. A user is someone who signs the handover three times a week. In the pilot
> every sign-off is an event on our server, no guest data, so that number is on our own dashboard from
> day one. No paid ads: Norway has about 93,000 hotel rooms, about 33 million kroner a year at full
> share, so the scale is the Nordics through the Mews and Apaleo marketplaces. If fewer than two of ten
> hotels take the pilot by 8 December, we stop and test the robot-maker channel."

Honest version if the round wasn't run (she scores it 6): "We haven't asked a hotel yet; Monday we
call ten Oslo night desks with four questions and bring a printed handover of their own night. We'll
know we have a user the way the pilot counts it: a sign-off three times a week, each one an event on
our server. Today the sign-off is kept on one device, and the screen says so."

**The Wybe juror (Wybe Robotics; the Night Shift challenge).** *"Every 'done' your agent sends is checked
against our score first. That's where your 99.7 % comes from. A hotel has no score. Hide the score from
your agent: what's your false-done rate then, and what replaces our referee on a real robot?"* (Hamad,
about 40 seconds)

**Score-blind experiment. Resultat: PENDING** (the controller fills this in: build and branch, seeds,
shifts, start times, "X of Y «ferdig» godkjent med poengsummen skjult", the misses and their kind,
and the log paths). Until it is filled, don't say the first two sentences below.

> "We ran it this morning: [N] practice shifts, seeds [..], with the score hidden. The agent said 'done'
> only from what the world told it: 'placed inside the room', the guest's 'thanks', a door opening. It
> never read the score or your reply. Your referee credited [X of Y]. [The misses were [kind], so on the
> handover that kind shows as *ikke bekreftet* until a person checks.] On a real robot the referee is
> replaced per task by a second, independent signal: a delivery needs the guest's acknowledgement or a
> compartment sensor plus a photo; a room check never means opening a booked room, so occupancy comes
> from the lock trail and the energy slot, and the robot only checks rooms the booking system shows as
> vacant; a spill needs the sign placed plus a photo. One signal alone reads *ikke bekreftet*. And we're
> straight about what your score taught our robot: 10 of its 15 master-key entries came without a knock,
> it kept crossing corridor 2B after slipping there and never signed it, and it moved a sign off a floor
> that was still wet. Those lines are on its card now, and a pilot runs with them off."

Honest version without the result: "We haven't measured it with the score hidden. What we can show is
the split: 9 of the night's 73 'done' rested on the robot's own judgement, 9 of 9 credited, and 185 of
189 over 18 nights." What hotel rules (knock first, no sign moves, a 20 % battery reserve) cost in
Wybe's sim is **not measured**: don't give a number.

Don't say "we switched off the sign move": `sign_move` is still in `DEFAULT_EXPERIMENTS` on
`hamad/final`. Sources for "since about 2014", Relay and Henn na: [Relay Robotics, 2022](https://www.businesswire.com/news/home/20220627005165/en/Relay-Robotics-to-Showcase-Newest-Service-Robot-at-Worlds-Largest-Hospitality-Tech-Conference-HITEC-Orlando);
[IFR 2025](https://ifr.org/ifr-press-releases/news/service-robots-see-global-growth-boom);
[Hotel Management, "Japan's Henn na Hotel fires half its robot workforce"](https://www.hotelmanagement.net/tech/japan-s-henn-na-hotel-fires-half-its-robot-workforce)
(after the Wall Street Journal, Jan 2019).
Sim-to-real gaps to name before he does: in a pilot the robot does **not** open booked rooms with a
master keycard (occupancy comes from the door-lock audit trail and the keycard energy slot; the robot
only knocks, or checks rooms the booking system already shows as vacant), keys ride in a locked
compartment, and lifts need a per-building integration, the pilot's hard part. A room the robot
delivered to tonight is never offered for sale. The four *Roboten ga videre* items are mostly what was
left at 06:00, not hand-backs made during the night. The rate-limit probe on Wybe's server
(`docs/research/wybe-api.md` § 14, on branch `hamad/handoff-score-lobby`, not on this branch yet) was
one nine-second measurement; the final runs well under it.

**The law juror (Law).** *"Your first figure, about 1,500 kroner for room 213, comes
from your robot opening a room at 04:24 that the booking system says is still Ola Nygård's. Your own
PRD says a real robot won't do that. So in a real hotel, where does that number come from, and who
answers if the room is resold while the guest still has a right to it?"* (Hamad, about 45 seconds)

> "You're right: in Wybe's simulation the robot opens booked rooms, and in a real hotel it never does.
> The line under 213 on the screen says where a pilot gets that evidence: the door-lock log and the
> energy slot. 213 is now what a sleeper really is: the guest was due out yesterday and the check-out
> was never recorded, so his check-out time has passed, and the booking system still blocks the room.
> Nothing is resold on the robot's word: the desk confirms the guest has left, then the manager
> releases the room, two steps, and a room the robot delivered to tonight, 209, is held back. The hotel
> is the controller and owns the room decision; we'd be its processor under an Art. 28 agreement. The
> sub-processors, checked this morning against primary sources: ElevenLabs and Vercel are on the EU-US
> Data Privacy Framework list; Anthropic isn't, so the standard contractual clauses in its DPA carry that
> transfer, and a transfer impact assessment comes before a pilot. The camera fails closed: if the
> person detector isn't running, no image leaves the phone, and the start screen says exactly that.
> Resepsjon tells callers before the call that it goes to ElevenLabs and Claude in the USA and that the
> text is deleted after 30 days. Before a pilot: a DPIA, a discussion with the staff representatives
> under arbeidsmiljøloven chapter 9, and Datatilsynet's view on whether a moving camera falls under the
> camera regulation. The name: the searches at Patentstyret, EUIPO and WIPO are still to do, including
> whether Ferrero's reputation reaches us. [if done: 'They're clear in classes 9, 42 and 43 as of
> [time].']"

Background if he digs (details and links in `docs/PRIVACY.md` § 3.1, § 7 and § 9):

- **The Norwegian acts in force today:** personopplysningsloven; arbeidsmiljøloven chapter 9;
  forskrift om kameraovervåking i virksomhet (FOR-2018-07-02-1107); produktansvarsloven (1988) for
  liability today, while the new Product Liability Directive (EU) 2024/2853 is due in EU law by 9 Dec
  2026 and reaches Norway only through the EEA; markedsføringsloven for price claims.
- **Dates, with the EEA caveat:** AI Act Art. 50 (say you're an AI) applies in the EU from 2 August
  2026, and the receptionist says it is an AI; in Norway it applies once taken into the EEA Agreement
  and Norwegian law (status **to verify**). The Machinery Regulation (EU) 2023/1230 applies in the EU
  from 20 January 2027.
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

**The product juror (Opera; Product).** *"You showed me one page, but your sidebar has thirteen modules and a
second market. For the first pilot hotel, which of them did you delete, and what number in four weeks
tells you this one page works?"* (ShirazIQ)

> "For the pilot the manager sees four things: Overlevering, Rom, Forespørsler, and the robot's night as
> evidence. [Point at the sidebar: everything else sits under *Utenfor piloten*, collapsed.] Stock,
> staff and guests belong to someone else's system of record. The camera and the phone are other
> buyers; we built them this weekend for Holio and ElevenLabs, and they're not in the pilot. The host
> view isn't either. We also cut a database, any write-back to the PMS (the PMS stays the truth), and
> *Timer spart* and *Gjester fornøyd* from the first screen. We'll know on two numbers against a
> week-zero baseline from their own logbook: minutes from 06:00 to the first room released, and kroner
> of rooms released in Fettero and sold the same day according to the PMS. [fill from § 8.2: 'This
> morning [N] people who'd never seen it found room 213 in [S] seconds.'] Our kill rule: if fewer than
> three of the hotel's morning managers tap *Kvitter* three times a week by week two, this page isn't
> their handover, and we stop."

What drops it to 6–7: listing the cuts without showing the sidebar, or "hours saved" as the metric.
His AI angle, one sentence for beat 3 if asked: "There's no language model on this page: every line is a
projection of logs, so it can't make anything up; the simulator's referee was our eval."

**The creative juror (Opera) and the design juror; Creative and design.** *"How have
you tested this with users, and what did you change because of it?"* (ShirazIQ)

> [fill from § 8.2, raw numbers] "This morning we put [three] people who had never seen Fettero in front
> of it, cold: four tasks, a stopwatch, no help. [N of 3] found the room they could sell in [S]
> seconds; [where the others got lost], so we changed [one thing] (commit [`…`]), and [two new people]
> then found it in [S] seconds. The raw notes are in DEMO.md § 8. We also called [N] Oslo receptions:
> [tally, one quote with permission]. What we haven't done is watch a real 06:00 manager use it in a
> real hotel; that's Monday, with a printed handover of their own night."

Honest version if § 8 wasn't run (both jurors cap it at 6): "Not with users yet. We ran structured
reviews of every screen, AI-assisted, one per juror's field, and changed what they found: what's open
now takes the wide column, the proof sits behind *Slik vet vi det*, and the sign-off moved to the end,
after the robot's judgement. That isn't user testing; a hallway test is the next thing we'd do." Why
this look: a calm operations tool for 06:00. One grotesk and one mono, light working screens, night
steel for the robot's world, one orange action per screen, states always in words, red and amber only
in the bell (`DESIGN.md`). If the name comes up: "Fettero is our team's name; it means nothing, and the
line says what we do." (Said aloud it is close to Ferrero: `docs/PRIVACY.md` § 9.)

**The Holio juror (Holio; warehouse).** *"Warehouses solved 'is it really done?' twenty years ago:
you scan the bin and the item. Your page says nothing reads 'done' unless it's confirmed, but confirmed
by a simulator's referee. Why hasn't anyone built this handover for hotels before, and what plays the
referee in a real hotel on Monday?"* (Hamad)

> "Because the evidence was never in one place. The PMS knows bookings, the lock knows doors, the
> housekeeping app knows tasks and the robot knows what it saw. Each vendor builds a dashboard for its
> own data: hotelkit, Quore and Optii for tasks, Relay and Pudu for their fleets. Nobody signs it into
> one handover with owners. In a real hotel, 'confirmed' means what your scan means: a second,
> independent signal. A delivery is the robot's drop plus the door-lock event. An empty room is the lock
> trail plus the energy slot plus the robot's photo. A spill is the photo plus the sign placed. Each line
> names its signal, and a line with only one says *ikke bekreftet*; that rule is on the judgement card.
> The simulator's referee was how we tested the robot's honesty; on its own judgement it was right 185
> times out of 189. In the pilot the lock trail plays that role, and we measure the same thing: robot
> 'done' that a person had to redo."

At the Holio stand he asks: *"Scanners have been around for 20 years. Why is the item with no barcode
still unsolved, and what did your 20 items show?"* (ShirazIQ)

> "Because it needed a model trained per catalogue, and Holio's customers are hundreds of small web
> shops whose catalogues change every week. A vision-language model reads the pack with no training.
> The open purchase order, or the return's original order, gives it 5 to 40 candidates, not 20,000, so
> it's most accurate exactly where unknown items appear. [fill from a 20-item eval: 'R right, U unsure
> and stopped for the label, W wrong and caught by the label check, median S seconds, about K øre a
> scan', or:] It isn't measured yet. When the model isn't sure, nothing goes on the pick list until the
> worker types the SKU from the label and it agrees; on a TC27 that would be the hardware scanner.
> Against a list sorted by shelf, the pick round is 16 metres, 10 %, shorter on our four-shelf test
> map, and nothing uses order history yet. Give us your test catalogue with product images and a TC27
> for a week, and we'll measure it on your returns desk."

Full status per pain: `docs/HOLIO.md`.

**The founder juror (Founders).** *"Room 213's guest was due to leave today, so any PMS already
sells that room tonight. Where do the 1,500 kroner really come from, who has told you they'd pay NOK 30
a room for this, and what do you do on Monday morning if you win?"* (Hamad)

> "You're right, and we fixed it this morning. A due-out room is already in tonight's inventory. The
> money is in rooms the booking system still blocks: a guest due out yesterday whose check-out nobody
> recorded. On the demo night that's 213: one room-night, extra only on a night the rest of the hotel
> sells; Oslo hotels sold 72 % of their rooms last year, SSB says. [fill from § 8.1: 'This morning we
> called ten Oslo hotels and reached [N]. [M] hand over on paper or in PMS notes. [K] find a room in the
> wrong state [X times a week], and [hotel type, about R rooms] said yes to a free four-week pilot.'] [if
> asked at the Wybe stand: 'Wybe said [answer] when we asked about a pilot hotel.'] We've picked one
> wedge: independent and chain hotels of 60 to 200 rooms, software first, the robot optional, because
> the 06:00 handover exists in every hotel tonight, robot or not, so the pilot needs no hardware. Monday
> at nine ShirazIQ calls back the yes with a printed handover of their own night. The pilot measures one
> number: rooms found in the wrong state and then sold or checked in early, in kroner, against our
> price. Both of us work on this full-time for four weeks. If fewer than two of ten hotels take a pilot
> by 8 December, we stop the hotel wedge and sell through robot makers. Norway alone is about 33 million
> kroner a year at our price, the four big Nordic countries about 130 million, so the scale path is the
> PMS marketplaces, then a robot connector per robot per month."

Honest version if the calls didn't happen (he scores it 6–7): "We haven't spoken to a hotel yet; that's
Monday's first job: ten calls and a printed handover of their own night. Until then the kroner are one
room on one night, not a promise."

**The Wybe engineer (Wybe Robotics; Founders and robots).** *"Take out the bookings you wrote: 213
was due out today, and on seed 16 our night manager told your robot 209 was empty for an arriving guest.
What is left on this page that comes from the robot alone, would a hotel or a robot maker pay for it,
and what exactly does a robot have to send you on Monday?"* (Hamad, about 40 seconds)

> "You're right on both, and the screen says so now. The bookings are our test data, written after the
> night to show the join; each of those rows says *Testdata: bookingen er lagt inn av teamet*, and it
> says Fettero held 209 back, not the robot. We also made 213 a real sleeper in that test data: due out
> yesterday, never checked out. What comes from the robot alone, last night: three wet floors with place
> and time, one it slipped on and one it took its own sign from; a stranger at seven doors, refused
> every time, with the keycard held at 209 and 304 until he'd gone; bags for three arrivals in 212 and
> two in 304, flagged for the desk to check; 10 of its 15 master-key entries without a knock, on its
> card; 73 'done', 9 of them on its own judgement and all 9 credited, and 4 hand-backs, each with a
> reason. None of that needs a PMS. Who pays first: the hotel, software only. Robot makers next, per
> robot per month, because their hotel pilots stall on 'did it help'. What a robot sends us: one JSON line per event: tasks (start, done or handed back, with the evidence each 'done' rests on), hazards, security events, position and battery, in `docs/runlog.schema.json` [if committed by then]. [if the *Kilde* switch has landed: 'Here's a second robot's log, an Open-RMF task-state sample, on the same page.']
> In a hotel there's no referee, so 'done' without evidence shows as unconfirmed. [if asked at the
> stand: 'We asked you this morning, and you said [answer as given].']"

What drops it to 6: defending the 1,500 kroner as found by the robot, or "the PMS is just test data"
without saying it was written to fit.

Prior art to name: delivery robots since about 2014 (Savioke, now Relay Robotics), Pudu and Keenon;
ops and handover software (hotelkit, Quore, ALICE, Optii, Flexkeeping); door locks and energy systems
that already see occupancy (ASSA ABLOY, Salto, dormakaba). Our gap: one handover that signs every
source's evidence with owners, and the robot's own evidence at night.

### 6.2 Other likely questions

| Question | Answer | Who |
|---|---|---|
| Is this live or hard-coded? | Live app with login. The night is a real practice night our final agent played against Wybe's server; rooms, requests, routes, the 3D map and the handover are computed from its log through one selector. Bookings, guests, staff, stock and prices are test data, and every list says which is which. | ShirazIQ |
| Why Fettero, not Lobby? | Lobby is a funded Zurich hotel-AI company (USD 2.2 M, Mar 2026) sold through Apaleo's Agent Hub, our planned channel. Fettero is coined and already our team's and robot's name. The team lead decides whether `main` follows. | ShirazIQ |
| Doesn't the PMS do this? | The PMS automates the night's accounting (Mews has no night-audit button). Room discrepancies in OPERA or protel are fed by housekeeping in the morning. Nobody puts a robot's night, the phone and the staff into one signed handover. | Hamad |
| 85 requests a night in a 36-room hotel? | That's game density. A real hotel sees a handful of night requests, which is why we price on rooms found and released, not on tasks or hours saved. | Hamad |
| What if the robot calls a room empty and the guest's bag is behind the door? | That happened on the demo night, and it's on the screen: 209 was empty and tidy at 03:47, but the robot carried an arriving guest's bags in at 04:35 and 05:16, so Fettero holds it back instead of offering it. A room is offered only if it was empty after 01:00 and the robot delivered nothing to it later, and selling it takes two steps: the desk confirms the guest has left, then the manager marks it. The bookings on those rows are our test data, and each row says so. | ShirazIQ |
| Is the money real? | It's gross room revenue at last night's average rate in the test PMS (NOK 1,467), for a real sleeper: 213's guest was due out yesterday, the check-out was never recorded, so the system still held the room tonight. It's extra only on a night the rest of the hotel sells; Oslo sold 72 % of its rooms in 2025 at NOK 1,631 a room (SSB table 14169). Say "on the demo night", never "per night". | Hamad |
| What does the robot add that the lock doesn't? | Its own night as evidence: what it delivered where (bags for three arrivals in 212 is now an open item for the desk), hazards with place and time, refusals of a stranger, and its own faults (10 of 15 master-key entries without a knock). Finding sleepers is the lock log's job, which is why hotel number one needs no robot. | Hamad |
| What would you cut first? | Already cut: linen counting by camera, voice-to-work-order, translation between guest and staff, a database, the red alert band. Kept: one handover story that runs end to end. | ShirazIQ |
| Where did "Timer spart" go? | Off the screens in round 4, on Oversikt and in the host view: it was an estimate (tasks × assumed minutes) on a first screen that should carry only what the data proves. The pilot measures minutes from 06:00 to the first room released instead. | Hamad |
| Who is Siri? Her plate says *Admin*. | The demo persona, a morning manager; the account is an admin so it sees the whole pilot menu. | ShirazIQ |

## 7. The business slide

Proposals the team presents as hypotheses, not facts. Every outside number links to its source.

**One wedge (decided Sun 8 Nov): independent and chain hotels of 60–200 rooms, software first, the
robot optional.** Hotel number one needs no robot: Fettero reads its booking system (read-only), the
door-lock audit trail and the night staff's notes, and the 06:00 page comes out. When a hotel has a
robot, its log is one more source of evidence on the same page. **The reason, in one sentence:** the
06:00 handover exists in every hotel tonight, robot or not, so a pilot needs no hardware, and the
60–200 band is the typical Norwegian hotel (about 86 rooms on average: 92,678 rooms in 1,079 hotels,
SSB table 14164, Sep 2026). Robot makers are the later channel and the next price lever, not the first
customer. The host view (`/vert`) is not on the slide: it was a test that the engine generalises, and a
second market on the slide reads as "not chosen".

**One buyer.** The general or operations manager of that hotel (the person who signs). The user is the
night or front-office manager who signs the 06:00 handover. **To verify:** what share of Norway's hotel
rooms sits with the big chains (Hotelloversikten lists chain membership). If it is most of them, a
chain's operations director buys centrally on a 6–12-month cycle, and the first 100 users come from
independents and small groups, as the channel order below assumes. SSB has no public table by hotel
size, so the number of hotels in the band isn't counted yet.

**One price.** **NOK 30 per room per month**, minimum NOK 1,500 a month. That sits inside what hotel
operations add-ons charge per room per month: HelloShift USD 1.25–4
([G2](https://www.g2.com/products/helloshift/pricing)), Hoida EUR 2.50 with a 50-room minimum
([Ekeria](https://www.ekeria.com/en/hoida-hospitality/hoida-hospitality-pricing)), Sweeply EUR 3
([SoftwareFinder](https://softwarefinder.com/hotel-management/sweeply)); a mid-market cloud PMS is USD
5–12 ([Roommaster](https://www.roommaster.com/blog/hotel-software-pricing-guide)).

The arithmetic, against what the room check found on the demo night: one room to sell after the desk
confirms (213: the guest was due out yesterday and the check-out was never recorded, so the booking
system still held the room tonight; NOK 1,467, last night's average rate in the test PMS) and one held
back (209, where the robot had delivered an arriving guest's bags). It's gross room revenue, and it is
extra money only on a night the rest of the hotel sells (2025: 57 % of Norway's hotel rooms sold, 72 %
of Oslo's; SSB table 14169), so the price must also pay on rooms ready earlier and early check-ins sold.
Room prices below are SSB's 2025 averages per room sold (table 14169): Norway NOK 1,471, Oslo NOK 1,631.

| Hotel | Price a month | Equals | Pays for itself when |
|---|---|---|---|
| 60 rooms | NOK 1,800 | 1.2 room-nights at Norway's NOK 1,471 (1.1 in Oslo) | the room check releases about one sleeper a month that then sells |
| 100 rooms | NOK 3,000 (NOK 36,000 a year) | 2.0 room-nights at NOK 1,471 (1.8 in Oslo); about two rooms like 213 on the demo night (2 × NOK 1,467) | two sleepers a month, sold |
| 200 rooms | NOK 6,000 | 4.1 room-nights at NOK 1,471 (3.7 in Oslo) | four sleepers a month |

**How big, honestly (the founder juror, the marketing juror).** Norway has 92,678 hotel rooms (SSB 14164, Sep 2026). At NOK 30
a room a month, NOK 360 a year, that is **about NOK 33 M a year if every hotel room in Norway paid**: a
small business on its own, so Norway is the proving ground. The four large Nordic countries have about
**359,000 hotel bedrooms** (Eurostat [`tour_cap_nat`](https://ec.europa.eu/eurostat/databrowser/view/tour_cap_nat/default/table),
hotels and similar (NACE I55.1), 2025: Sweden 139,723, Norway 96,782, Finland 61,472, Denmark 61,010;
Iceland last reported 15,888 in 2020): **about NOK 129 M a year** at full share, reached through the PMS
marketplaces (Mews, Apaleo, VisBook), not a sales team. Eurostat's Norway figure is the year's capacity,
so it sits above SSB's monthly count of open rooms (86,565–93,871 in 2025–26). **The next price lever is
the robot:** a connector per robot per month, sold through robot makers whose hotel pilots stall on
"did it help"; the price is to be tested, not set.

Add-ons, later: the AI receptionist per handled call (ElevenLabs' cost plus a margin); a robot
connector per robot per month, sold through robot makers (the next price lever, above). Short-let
hosts (`/vert`) are not on the slide.

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

**The commitment and the stop rule.** Both of us work on this full-time for four weeks from Monday
9 November. If fewer than 2 of 10 hotels take a free four-week pilot by 8 December 2026, we stop the
hotel wedge and test selling through robot makers instead.

**Channel, in order** (the wedge decides it: hotels first, the robot later).
1. **Direct** for hotel 1: from Sunday's phone round (§ 8), a visit with a printed Overlevering of
   their own night. The printed page carries the name (*Fettero · Natten, ærlig overlevert. · Team Fettero, Oslo
   Sprint 2026*; no contact address on it yet), so it works as the leave-behind;
   print the demo night (*Skriv ut*) and hold it up in the final: "This page is what hotel number one
   gets on Monday."
2. **Robot makers** (Wybe, on this jury, and others), for the hotels that have a robot: Fettero is the
   manager's page their robot's log feeds. Ask Wybe one concrete thing at the stand before 14:00:
   "Would you put this handover, fed by your robot's task log, in front of one pilot hotel's morning
   manager for two weeks, and what would your log need to contain?" Write the answer down as given.
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
week**; the activation metric is already a button in the product. How we'll count it: today the
sign-off lives in one browser; in the pilot every *Kvitter mottatt* is an append-only event on our
server (hotel, role, date; no guest data), and that count is the user number from day one (not built
yet; PRD § 6). About ten people per hotel sign a
handover (night managers, receptionists, the housekeeping lead: our assumption, probably high; a
60–200-room hotel may have 3–6 people on that shift, so ask it in the phone round, § 8.1 Q5), so **100
users ≈ 10 hotels**, or 20–30 if the phone round says 3–6.

| Order | Hotels | Users | Channel | Gate |
|---|---|---|---|---|
| 1 | 1 | ≈ 10 | direct, from the Sunday phone round | one yes to a free pilot |
| 2 | 2–3 | ≈ 20 | independents through VisBook, and one robot maker's existing hotel customer | hotel 1 has a kroner number |
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
4. **Q3:** "Står det rom som opptatt i systemet om morgenen der gjesten egentlig reiste i går, uten at
   utsjekken ble registrert? Hvor mange i uka?" (the real sleeper rate the price depends on: a guest
   due out *today* doesn't count, the PMS already sells that room; write the number they say)
5. **Q4:** "Hvis en skjerm fant de rommene før kl. 07, ville 30 kr per rom i måneden vært verdt det?"
   (the first price signal: yes / maybe / no, and why)
6. **Q5 (if time):** "Hvor mange personer tar morgenvakten i løpet av en uke?" (tests "about ten users
   per hotel" in § 7)
   **Q6 (if time, the message test, the marketing juror):** "Hvis du bare fikk se én ting kl. 06:00, hva ville det
   vært: (a) rom som kan selges, (b) hva som er åpent og hvem som eier det, eller (c) hva
   roboten eller nattevakten faktisk gjorde?" Write their exact words: the phrase used most becomes the
   hook line.
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
