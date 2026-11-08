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
confirmed.** Hotel number one needs no robot: Fettero reads its booking system (read-only), one signal
per room from the door lock, never who, and the night clerk's own entries. The robot is how we prove
"confirmed" can be measured, and we hold it to the same rule: **of the 9 "done" our AI agent claimed on
its own judgement on the demo night, the simulator credited 9, and its own log contradicts one (209),
so the card says 8 of 9.** And it isn't one lucky catch: run over every night, the same rule finds
that the simulator credited 64 of the final branch's 65 distinct claims, but only **54 of 65 hold
against the robot's own log**, because the simulator's room check doesn't see what the robot itself
delivered (§ 1.1).

Two figures in the pitch, no more (design review): the room **found free hours earlier, about 1,500 kroner
if the night sells out**, and **8 of 9**. Everything else is for questions (§ 1.1).

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
  was never recorded, so the booking system still has him in house. **Never "otherwise unsold"
  (founders and domain review):** housekeeping's round would find the room by late morning. What Fettero buys is
  the hours: found free before the round, worth the kroner only **if the night sells out** (the demo
  hotel has 31 of 36 booked tonight, and the money figure says so) or for an early check-in. Say "on the demo
  night", never "per night" or "per hotel".
- A room whose guest is **due out today** is not a sleeper: every PMS already sells it tonight. What
  finding it empty early buys is an early clean and an early check-in, not a room-night.
- That a real robot would open a booked room. It did in Wybe's simulation; in a pilot the evidence for
  213 is the door-lock log (no entry since the evening) and the energy slot, and the robot only checks
  rooms the booking system shows as vacant.
- Any customer, pilot, user or waitlist. None today.
- That 64 of 65 is "the figure that carries over to a hotel". It is what the simulator credited. Held
  against the robot's own log it is **54 of 65 (95 % interval 72–90 %)**, and on the dress rehearsal's
  never-played seeds 88 of 101. Quote both figures, never the first alone.
- That the simulator's room check is a camera. It answers a `look` in text; the card says *robotens
  blikk*. 209 is the simulator's gap (it drops what the robot delivered), not a camera miss.
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
regenerated at 04:08 Sun (229 live starts; the all-nights rows move as nights are logged); the rows
for the build that plays at 12:00, the forecast and the dress rehearsal from C's regeneration at 05:50
(278 live starts); the 209 rule over every night and the fault test's catch rate from C's regeneration
at 06:41 (`2227146`, 310 live starts; the printed figures are in **`docs/runs/summary.txt`**, which
`--check` checks too).
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
| **The build that plays at 12:00: `8de9ffc`**, the head of `hamad/final` at 05:50 (`c3801e0` plus a cleaning-closed corridor avoided 90 min; `013f90d` has the same agent) | tuned seeds (04:50): 10 **2,759** · 16 **2,748** · 23 **2,298** · 5 **2,559**, mean **2,591**. **Dress rehearsal on ten seeds no build had played** (22, 34, 53, 55, 67, 70, 78, 83, 86, 93; started 05:02, all 10 complete at 05:50): 22 **2,085** · 34 **2,166** · 53 **2,481** · 55 **2,138** · 67 **2,312** · 70 **2,186** · 78 **2,008** · 83 **2,236** · 86 **1,786** · 93 **1,969**; mean night **2,137**, **mean of the best 9 of 10 (the final's statistic) 2,176**; 573 of 573 "done" credited, 101 of 101 on its own judgement | `builds.csv` rows `013f90d`, `8de9ffc` |
| **Forecast for the final** (mean of the best 9 of 10 unseen seeds, `8de9ffc`) | **median 2,050, 80 % between 1,759 and 2,393.** Model: log score = build + seed, least squares over 67 build×seed cells of complete live build nights (19 builds, 20 seeds), then 20,000 simulated finals. The band carries the tuning penalty's uncertainty (drawn per simulated final from N(−0.054, 0.106)) and the leave-one-cell-out error (0.088 on the log scale, against an in-sample 0.063): the data review's correction; the earlier, narrower method gives 1,903–2,196. **Why lower than the tuned nights (2,591): mostly seed difficulty.** The four seeds this build played are easy (+19 % against the average seed; the unseen ones −4 %), which alone is −19 %; the tuning penalty we can measure is −5 %, from two nights (leave-seed-out on `d4e445c`: seed 9 predicted 1,865, played 1,965; seed 11 predicted 2,245, played 1,914). Sensitivity: no penalty 2,163, penalty doubled 1,942. Regenerated 05:50 Sun, before the final (the rehearsal kept out of the fit). **The larger risk no band covers:** the final may use another map and other tasks | `docs/runs/forecast.txt` (`python3 scripts/forecast.py`, reads the head of `hamad/final` from git) |
| **A second forecast, from the dress rehearsal** (committed at 06:44 Sun, before the final; data review) | **median 2,170, 80 % between 2,055 and 2,301**: a posterior predictive of `8de9ffc`'s ten rehearsal nights (log scores; mean and SD drawn per simulated final from their posterior; ten new nights, the best nine; 20,000 finals). No model, no tuned seed, no tuning penalty. It replaces the rehearsal's ten-point bootstrap (2,091–2,243), which ignored that uncertainty. **How the ten seeds were chosen is not recorded**; the seed hunt (Sat 21:40–23:38) estimated them at 2,735 points on average against 2,814 over 78 probed seeds, percentile ranks 8–85: typical, not easy. **Both, before the final: the model 2,050 (1,759–2,393), the rehearsal 2,170 (2,055–2,301); the final: [fill after 13:05]** | `docs/runs/forecast.txt`, *SECOND FORECAST* (`c6b8c54`); `docs/runs/seedhunt-sweep1.log`; `src/features/nightshift/data/forecast.json` |
| **Forecast against the dress rehearsal** (out of sample) | The forecast committed at **04:08**, before the rehearsal (`b57e4c1`, for `c3801e0`: final median 2,035, 80 % 1,898–2,186), expected a **mean night of 1,989** on unseen seeds. **Result: the rehearsal's best 9 of 10 is 2,176, inside the committed 80 % interval**; its mean night, 2,137, is **+7 %** on the forecast (+2 % against the forecast without the penalty). The rehearsal's own bootstrap for the final: 2,168 (80 % 2,091–2,243), on its ten seeds only. Practice seeds go to 999 (`docs/research/wybe-api.md`), so a holdout was always available; "the final is the only true holdout", which we wrote at 04:08, was wrong | `docs/runs/forecast.txt`, section *Out-of-sample check* |
| "Done" credited, 18 nights of these four builds | **1,263 of 1,267 (99.7 %)**; the 4 not credited were all on seed 23, one per build | `builds.csv`: `done_reports`, `done_credited` |
| What each "done" rested on, same 18 nights | **1,078** sent after the agent had seen the score rise during the task (credited by construction: the simulator's verifier, not trust). **189 on the robot's own judgement, 185 credited (97.9 %)**: room checks **117 of 117**, spill reports **68 of 72**. The 4 misses are one probe (R-037 on seed 23, a sign on another request's patch) repeated in all four builds, because what the agent learns resets every shift. **Counted once per (seed, request), the 189 are 65 distinct claims: 64 credited, 95 % (Wilson) interval 92–99.7 %**; the only miss is 23/R-037. **Held against the robot's own log, 54 of 65 hold (72–90 %)**: next row | `builds.csv`/`ledger.csv`: `done_after_rise`, `done_own`, `done_own_credited`, `done_room_check*`, `done_spill*`; the distinct count in `ledger.json` (`distinct_own`); the rule in `scripts/ledger.py`, which the app's `doneBasis` runs too |
| **The 209 rule over every night** (data and domain review) | The card's rule (`selfContradictions`): a room check reported "done" is contradicted when the robot had placed a non-sign item inside that room earlier the same night, its last look there says nobody here, empty or tidy, and the look doesn't list the item. Now in `scripts/ledger.py` for every night. **The final branch's 18 nights: 54 of 65 distinct own-judgement claims hold against the robot's own log (95 % interval 72–90 %)**, against 64 of 65 credited by the simulator; 10 of 40 distinct room checks contradicted (34 of 117 reports, all 34 credited), on 17 of 18 nights. **The dress rehearsal (`8de9ffc`, ten never-played seeds): 101 of 101 own-judgement "done" credited, 88 of 101 hold (79–92 %); 13 of 64 room checks contradicted, on 8 of 10 nights, and the simulator credited all 13.** Every complete live night (198, board tests and experiments included): 357 of 994 room-check reports contradicted, on 185 of 198 nights. The demo night: 8 of 9 (R-049, 209). Why: the simulator drops what the robot delivered from its look, so its room-check credit can't see it. The robot itself doesn't compare a room check with what it placed there (`flows.room_check` on `8de9ffc`) | `docs/runs/summary.txt`; `builds.csv`/`ledger.csv`: `room_checks_done`, `room_checks_contradicted`, `done_own_holds_log`, `contradicted`; `ledger.json` (`distinct_own.holds_log`, `room_checks_final`, `rehearsal`) |
| "Done" with the score hidden (domain and data review) | Side branch `hamad/blind` (`NS_SCORE_BLIND=1`), four live nights started 04:26 Sun, seeds 10/16/23/5: the agent decides "done" only from what it saw, never from the score or the reply's wording. **The same 291 "done" reports as the sighted build, 290 credited**; the miss is R-037 on seed 23, the same spill the sighted build misses. Scores 2,760 · 2,748 · 2,304 · 2,559: the sighted `c3801e0`'s on 10, 16 and 5, +6 on 23. **Its own check said "not done" 0 times in 265** (D recounted the four logs): no action failed, so the run shows the score wasn't needed on those nights, **not how well the robot catches a failure**. We no longer quote a false-done rate from it | the four logs (`flags.score_blind`), `kind=experiment` and `blind_checks`/`blind_said_no` in `ledger.csv`; § 6.1 |
| **The verifier with failures injected** (data and domain review) | Offline, side branch `hamad/faults` (`4571de3`): 20 rebuilt real nights × 5 draws, 13 kinds of fault (a place that lands outside the room, a reply that doesn't answer, a sign beside the spill …), 640 nights. **The catch rate, per injected failure the robot didn't repair: the score-blind check caught 251 of 317 (79 %) at 5 % failing, 740 of 942 (79 %) at 15 %, 1,499 of 1,858 (81 %) at 30 %; without the sleeping-guest type, 88 %, 87 % and 90 %.** One injected failure in five became a false "done". Precision over every "done" moves with how often things fail, so it comes second: 98.5 % (recall 99.8 %) at 5 %, 95.5 / 99.7 % at 15 %, 91.0 / 99.7 % at 30 % (the sighted build: 98.8 / 99.5, 96.4 / 99.0, 92.0 / 98.3). It said "not done" **256, 734 and 1,578 times**, against once with no faults. Missed every time: a guest asleep in a room it checked (33, 94 and 195 times; the look said someone was asleep, and the flow still reported the check done), a polite off-topic reply (13, 39, 67), music that starts again (9 of 9, 38 of 40, 61 of 67); and a look-alike lost item in 11 of 24, 23 of 64 and 19 of 96. The fault bed's ground truth is the simulator's, so it can't see the 209 failure above. **Caveat:** the fault wordings are ours, so it measures the kinds of failure, not how often a real robot meets them | `docs/runs/fault-bed-real.md` (copied from `hamad/faults` `4571de3` by `scripts/ledger.py --faults-from`); `src/features/nightshift/data/fault-bed.json`; `catchRate` in `src/features/nightshift/ledger.ts` |
| **What hotel rules cost** (domain review) | Replay bed, 164 real nights, side branch `hamad/hotelrules` (`70d5be4`): all four rules **−125.8 points a night** (−100.4 weighted per seed), 0 strands. Per rule: knock before every keycard entry **−12.4**; never move a sign off a wet floor **−105.2** (the store holds three signs, so 415 spill reports declined for "no sign left" across the 164 nights); avoid a known wet corridor **0** (with the cart there is no dry way round); sign a patch nobody reported **−30.1**. A stock of signs per floor would make the safe rule nearly free. **Two more rules, replay only** (`hamad/hotelrules` `41b10f4`, 202 real nights, 30 seeds, 0 strands; not run live, not in the final build): a room check never calls a room empty against the robot's own record (*self_conflict*: the note says NOT EMPTY and names its own bags) costs **0.0** a night, fired 368 times on 190 nights, always its own bags, and live the simulator thanked 389 of 390 room checks of rooms the robot had carried bags into; **home by 05:45** (the master keycard back, then docked) costs **−90.4** a night (−84.3 per seed), keycard back on 202 of 202 nights; all six rules **−207.3** (−172.1), the four earlier ones on the same 202 nights −123.7 (−93.7). The simulator's points reward behaviour a hotel would forbid. **Live on Wybe's server** (`NS_HOTEL_RULES=1`, four nights complete at about 05:55 Sun): seed 10 **2,605** · 16 **2,584** · 23 **2,393** · 5 **2,453** against the final build's **2,760 · 2,748 · 2,298 · 2,559** on the same seeds (`c3801e0`'s nights; `013f90d`, the same agent as `8de9ffc`, 1 point lower on seed 10): **mean 2,509 against 2,591, −82 points a night**, less than the replay's −125.8; seed 23 went the other way (+95), and four nights can't pin the cost closer than that. It knocked before **59 of 59** keycard entries (the final build on the same four seeds: **26 of 61**) | replay: `hamad/hotelrules` `70d5be4`, and `41b10f4` for rules 5 and 6 (its `temp/hotelrules-report-2.md`; not on this branch); live: `builds.csv` row `70d5be4`; the knocks counted from the eight logs with `masterKeyEntries` (`src/features/nightshift/conduct.ts`); `src/features/nightshift/data/hotel-rules.json` |
| Declines, same 18 nights | 112 declined; the referee credited **93** (+5 each) and gave **19** nothing | `builds.csv`: `declines_credited`, `declines_not_credited` |
| Best practice score on the board | **2,807**, **#8 of 20** at 04:10 Sun, level with the team below us (top 3,448; we played 242 practice shifts, the leader 1,556). It came from a board test (the `lottery` checkout, `d7040b7`, seed 10, 03:38), so it is **not** the final build; the final branch's best (2,760, `8eac151` and `c3801e0`) would rank #11 | `nightshift-board.wybe.me/data`; `ledger.csv`, `kind` `board-test` |
| All full live nights, every version | **120** nights that ran to 06:00 by 04:08 (4 more stranded). Builds: **67**, Sat 13:15 – Sun 03:26, median **1,960**, mean **2,030**, most from earlier, weaker builds. Board tests: **53**, Sun 02:37–04:02, mean **2,753**, best **2,807**, on the seeds they were tuned for (42 on seed 10). Moves as nights are logged | `ledger.csv`, `end_reason` "server ended: time", `kind` |
| "Done" credited, every live night with a log | **8,156 of 8,191 (99.6 %)**, 130 nights at 04:08, every version: every build night with a log, and board tests only when they ran the full night; on the robot's own judgement **1,113 of 1,145 (97.2 %)**, room checks 657 of 662 (the figures behind *Slik vet vi det* on the judgement card; recomputed from the ledger on every build, so they move) | `ledger.csv`: `done_reports`, `done_credited`, `done_own*`, `kind` |
| The night in the app | seed 16, **2,680**, build `cb72845`: 85 requests, 73 "done", **73 of 73 credited** ("Noted. Thanks."): **64 after the score rose, 9 on its own judgement (5 room checks, 4 spills), 9 of 9 credited (95 % interval 70–100 %), 8 of 9 against its own log** (R-049: luggage-209 placed inside 209 at 01:29:26, "Nobody is here. The room is tidy." at 03:47:31; `selfContradictions` in `src/features/nightshift/conduct.ts`); at 05:57 not docked, battery 19.8 %, holding the master keycard and a towel, with the housekeeping cart (a towel, a toiletry kit) in corridor 3A; 8 declined, 7 credited (6 orders that never existed, 1 already delivered), 1 not (R-036, a spill report on floor 3); 4 still open at 06:00 (battery 8.6 % at 05:28:58); one penalty all night (−15, slipped on a wet floor in corridor 2B at 23:51) | `public/runs/demo.jsonl` (shift `w2-5991166a…`) |
| How we test a change before a live shift | a **replay bed** rebuilds every full live night offline (72 when we ran it at 02:55). Replayed with the code that played them, 50 nights land within **61 points (3.2 %)** of live on average, 48 of 50 within 10 % (the first 40: 72 points, 3.8 %, the figure we quoted before). **In-sample**: the reward model was fitted on 50 nights that include these | `docs/runs/replay-fidelity.txt` (from `python -m agent replaybench --fidelity`; `agent/replaybed.py` on `hamad/final`) |
| Wybe's final (10 shifts, Sun 12:00–13:00) | **[fill after 13:05: mean, rank]** | Wybe's board |

**The replay bed, honestly (the data review asks).** The 3.2 % shows the bed can reproduce a night with the
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

One user: **the morning manager taking over at 06:00** (Siri Haugen), from the night shift (Kjersti
Lund and the robot). One story: the night is over; what needs a person, what can go to reception, and
can I trust what the robot says. **One tab, one page: Overlevering 06:00**, where the pilot accounts
land after login. The page reads *act → evidence → sign*: four figures on top, each a link to its row
(209 held back, the money, safety *straks*, the robot); *Åpent nå* with an owner and a deadline per
item, safety first; the robot's judgement card as three figures beside the night clerk's note; *Kvitter
mottatt* last. Under the night line sits the switch ***Natten fra: Med robot | Uten robot***.

**The opening (decided in round 5): 209, the robot's own contradiction**, not a team-written booking
(the Wybe engineer, the creative juror): at 01:29 it carried bags into 209, at 03:47 it reported 209 empty. It is the first
figure on the page, it comes 100 % from the real log, and it sets up the rule the rest of the demo
proves. Then the wedge on screen in 10 seconds (*Uten robot*, the product juror), the money step done *without* a
robot, and the robot's card last. The data: a real live practice night of our agent (seed 16, 2,680
points, build `cb72845`, `public/runs/demo.jsonl`), test bookings, a team-written door-lock sample and
the night clerk's sample entries, all said in one quiet band under the night line. Before going on
stage: § 4.1.

**Timed on :3300 at Sun 05:44–05:50 as `siri`, at 1152×720 (1440 px at 125 %, the projector), in a
clean browser (Playwright),** after A's, B's and C's round-5 commits (last re-walk after A's `21cf85f`): login lands on Overlevering with
*Åpent nå* in 0.4–0.9 s; a reload shows it in 0.1–0.2 s. *Uten robot* answers in under 0.1 s; a figure
link scrolls to its row in about 0.6 s; three ticks and *Bekreft med resepsjonen* in about 0.15 s;
*Send til resepsjonen* in under 0.1 s; *Med robot* in 0.1 s; *Kvitter mottatt* in 0.05 s. The page is
2,774 px tall at 1152×720 (3.9 screens) with the robot, 1,625 px without; 2,662 px at 1440×900 (3.0);
5,074 px at 390 px (6.0), no sideways scroll at any size. **No free scrolling: every move is a tap.**
Each landing was checked on screen at 1152×720: the money figure under *Uten robot* lands with 213's
whole row (the lock, Kjersti's look, *Bekreftet av to kilder*, the name field, the three ticks and the
button) on one screen; *Home* and *Med robot* bring the top back; the robot figure lands with the card,
Kjersti's *«Rolig natt.»* and *Kvitter mottatt* on one screen. **Ten taps and one key**, 229 words with
the numbers read out: at 150 words a minute plus 0.7 s an action, **1:39; 1:53 at a calmer 130**. After
13:05 the final's score line adds about 4 s. There is little slack: if a beat stalls, drop the
sentence about the faults (they are on the card).

| Time | Screen / action | What the presenter says | Criterion it serves |
|---|---|---|---|
| 0:00–0:20 | **Top of Overlevering, *Med robot*.** Point at the first figure: **1 rom · Holdt tilbake fra salg · Rom 209: meldt tomt kl. 03:47, men roboten satte inn bagasje kl. 01:29**, then at **4 saker · Sikkerhet, straks**. No tap. (54 words) | "Six o'clock. Siri takes over the hotel. Fettero gives her the night on one page, and it checks the robot too. The robot reported 209 empty at 03:47, but its own log says it carried bags in at 01:29. So Fettero held 209 back. Beside it: four safety items, each with an owner, now." | A real problem · Innovation · Wybe (the Wybe engineer) |
| 0:20–0:29 | **Tap *Uten robot*.** The robot's lines go; the line under the switch says *Uten robot: bookingsystemet, dørlåsen (ett signal per rom, aldri hvem) og 4 registreringer fra nattevakten (eksempler)*. (28 words) | "Hotel number one has no robot. Same page: from the booking system, one signal per room from the door lock, never who, and the night clerk's own taps." | Product (the product juror) · Founders · Law (the law juror) |
| 0:29–0:44 | **Tap the money figure, *ca. 1 500 kr · Funnet ledig 5 timer tidligere*.** It lands on 213: *Dørlåsen: ingen kort i energibryteren siden 22:10. Kjersti Lund så rommet tomt og ryddig kl. 04:24. Bekreftet av to kilder.* (40 words) | "213: due out yesterday, check-out never recorded. The lock: no card since ten past ten. Kjersti saw it empty at 04:24. Two sources, no robot. Found at six, five hours before housekeeping: about 1,500 kroner if the night sells out." | Founders (the founder juror) · A real problem · Functionality |
| 0:44–0:58 | **Same screen:** the name field already says *Hanne Vold*; tick **Folioen er gjort opp**, **Ingen bagasje på rommet**, **Nøkkelkortet er sperret**; tap **Bekreft med resepsjonen**, then **Send til resepsjonen**. The row reads *Venter på PMS-en* with the kroner on it. (30 words) | "Reception confirms, and we record who: folio settled, no bags, key card blocked. Then it goes to reception. Our own button never says sold: it waits for the booking system." | Product (the product juror) · Law (the law juror) · Functionality |
| 0:58–1:25 | **Press *Home*, tap *Med robot*, tap the robot figure *73 av 77*.** It lands on *Robotens vurderinger i natt* (**8 av 9** · **7** · **10 av 15**), Kjersti's note and *Kvitter mottatt*, one screen. (62 words) | "With a robot, the page adds what only a robot sees. Kjersti wrote: 'Rolig natt.' From the desk, it was. The robot saw three wet floors and a stranger at seven doors, and refused him seven times. And it's held to the same rule: 8 of its 9 'done' hold against its own log. Its faults too: ten entries without a knock." **After 13:05 add:** "In today's final: [mean], rank [N]." | Innovation · Wybe (the Wybe juror) · data (the data juror) · Design (the creative juror) |
| 1:25–1:35 | **Tap *Kvitter mottatt*** → *Kvittert av Siri Haugen · nå · Natt til søndag 8. november er overlevert, med … åpne saker. Kvitteringen er lagret på denne enheten.* (15 words) | "Siri signs; she has the hotel. Fettero: *natten, ærlig overlevert*. The night, handed over honestly." | Design · all five |

Facts behind the lines (seed-16 log, `public/runs/demo.jsonl`; the samples): at 01:29:26 the robot ran
`place luggage-209 → room-209` ("Placed luggage-209 inside room-209"), and at 03:47:31 its look said
"Nobody is here. The room is tidy." and it reported R-049 empty and tidy, which the referee credited
(`selfContradictions` in `src/features/nightshift/conduct.ts`; the team's test booking, Hiroshi Sato in
209 until 9.11, is now only the consequence). 213: the test booking has Ola Nygård due out 7.11, the
check-out never recorded (`checkoutMissing`), so the booking system holds the room; the robot found it
empty and tidy at 04:24 (`room_status`); *Uten robot*, the door lock's sample says no card since 22:10
(`room_signal`, `src/features/doorlock/feed.ts`) and Kjersti's sample entry says *tom og ryddig* at
04:24 (`src/features/staffinput/`), two signals from outside a robot, so *Bekreftet av to kilder*
(`evidenceVerdict`). "Five hours": from 06:00 to the 11:00 check-out after which housekeeping would find
it (`src/features/rooms/money.ts`). 31 of 36 booked tonight: the test PMS. Safety: the robot slipped in
corridor 2B at 23:51:33 (−15, the night's only penalty) and crossed it 27 more times without a sign; at
04:38 it moved the sign from 3D (still wet) to 3C; 1C was wet without a sign at 06:00; the man in the
bathrobe asked about rooms 308, 209, 203, 202, 304, 137 and 205 between 01:17 and 05:11, refused every
time, the keycard held at 209 and 304 until he had gone. Of 15 keycard entries, 5 came after a knock.
73 `report done`, all credited; 64 after the score rose, 9 on its own judgement, 8 of them holding
against its own log. At 05:57 the robot stood in corridor 3A, not docked, battery 19.8 %, holding the
master keycard (the handover's item: *før 06:15*, owner the night clerk). The night clerk's note
*«Rolig natt. Støy fra rom 210 rundt 23:20 …»* is the first line of her sample entries in
*Nattevaktens logg* (`src/features/staffinput/entries.ts`, test data); with no entries the page falls
back to a test note that also starts *«Rolig natt.»*.

**Re-read every number off the build at the rehearsal** (the screens may still move): the kroner and
"5 timer", 31 of 36, the count in *Åpent nå*, the order of its items, the line under the switch, and
the card's three figures.

Rules for the presenter: don't explain the navigation; stay on this one page; every move is a tap on a
figure, the switch or a button, never a free scroll (the figures land the rows exactly at 125 %; a
hand scroll is how the 2B line or 213's button ends up under the fold). Don't open Øyne, Resepsjon,
Forespørsler, *Nattevaktens logg*, the 3D map or the host view in the 2 minutes (they are Q&A answers
and the 5–10 minute final, § 3); if a screen stalls for 3 seconds, say the line and move on. For a
non-Norwegian juror, say three on-screen phrases once with their meaning: *Holdt tilbake fra salg*
(held back from sale), *Uten robot* (without a robot), *Kvitter mottatt* (sign for it). Q&A openers on
the same page: the bell is not touched in the 2 minutes; *Slik regner vi* opens the money's arithmetic
(the founder juror); *Vis alt og slik vet vi det* opens the referee, the ledger, the score-blind run and the fault
test (the data juror, the Wybe juror); *Åpne nattevaktens logg* on a safety item under *Uten robot* opens the clerk's
screen (the product juror, the marketing juror).

## 3. Pitch outline for the final (5–10 min, top 10 at 18:00)

Each juror scores from their own field (CONTEXT § 11). Every part names the field it answers.

1. **Problem, story first, then money and safety (1 min; Real problem, Founders, Marketing).** Open
   on the image (design review): the 3D replay for 8 seconds, the robot at 209 at 01:27 with the stranger,
   then the page, where the night clerk's note says *«Rolig natt.»* beside three wet floors and a man at
   seven doors. "From the desk it *was* a calm night. The robot saw the rest. And we check the robot
   too: at 01:29 it carried bags into 209, at 03:47 it reported 209 empty. Fettero held the room back.
   It also found 213 free: the guest was due out yesterday and nobody recorded the check-out. Found
   hours before the housekeeping round, worth about 1,500 kroner if the night sells out. And every wet
   floor had an owner at 06:00." Then one SSB figure (staff churn). Then, inside the first 20 seconds of
   the business part: "Hotel number one needs no robot" and the *Uten robot* switch. Then what we heard
   on the phone this morning (§ 8) **[fill; if the round wasn't run, say "we haven't asked a hotel yet;
   that's step one"]**.
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
   - **Resepsjon** (ElevenLabs): *Samtalelogg* opens on last night's three calls, labelled *Eksempel*
     (made-up guests and numbers, each with the guest's words, the language and the task it became), so
     the screen is never empty if the live call or the wifi fails. Then *Ring resepsjonen*, ask in
     English or Polish for a room next weekend; it says it is an AI, quotes the direct price, haggles in
     fixed steps (at most 10 % under), records a request that waits for *Bekreft*, never takes a card
     number. Ask callers on stage to use a made-up name. (Team item: the live agent keeps the old guide
     and privacy wording until someone re-runs `src/features/reception/setup-agent.ts`.)
   - **Robotens øyne** (Holio pain 3): boxes drawn on the phone (nothing sent); tap a product, Claude
     reads the pack and matches the catalogue; when it is sure, *Vis vei* opens its route; when it isn't,
     the SKU stays hidden and there is no *Vis vei* until the label agrees. People are never cropped and
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
"Done", split by what it rested on: over the last four builds' 18 live nights, 1,078 sent after
   the score rose (the simulator's verifier), and on the robot's own judgement 64 of 65 distinct claims
   credited (95 % interval 92–99.7 %) but 54 of 65 holding against its own log (72–90 %): the referee
   has a blind spot, and the page shows it. The fault test: the check caught 79 % of injected failures
   (88 % without a sleeping guest it never catches). The forecast for the build that plays (`8de9ffc`: median 2,050,
   80 % 1,759–2,393) was committed before the final, and checked out of sample on ten never-played
   seeds: the 04:08 forecast gave 2,035 (80 % 1,898–2,186), and the rehearsal's best 9 of 10 came in at
   2,176, inside it. A second forecast from the rehearsal alone, also committed before the final: 2,170
   (80 % 2,055–2,301); after 13:05 the final goes next to both. The page itself has no language model in it: every line is a projection of logs, so it can't make
   anything up. The run-log contract is a file, `docs/runlog.schema.json`, with an Open-RMF adapter beside the Wybe one: Natteskift's *Robotlogg* switch drives the whole page, not just the card: the demo night; a second real log, the hotel-rules night on seed 16 (2,584 points: a knock before all 14 keycard entries and no sign moved off a wet floor, but it still slipped in 2B at 23:51, and the card's *Ved skiftslutt* shows the master keycard still in hand); and an Open-RMF sample night (our own example, labelled) with its own figures and no score, shaped like the compartment robots hotels actually run: the guest's PIN plus an empty compartment is *bekreftet*; the robot's own credential plus its own photo only *robotens egen observasjon*. "Confirmed" needs a signal from outside the robot.
4. **Business (1–2 min; Founders, Marketing).** The business slide, § 7: one buyer, one price with its
   arithmetic, today's tools, the channel, Monday's next step, the first 100 users.
5. **Team (20 s; Team efficiency, Founders).** Hamad (agent, app, tooling) and ShirazIQ (UI, voice,
   receptionist, demo, and the customers: the calls from Monday are ShirazIQ's). Two people, 48 hours,
   subagent-driven development, every change reviewed, tests and CI on every PR. Every live night logged
   and pinned to a shift id, and a replay bed to screen changes before a live shift. "We built thirteen
   screens and show one; the cut list is in the PRD." The commitment and the stop rule: **"We both work
   on this full-time for four weeks from Monday. If fewer than 2 of 10 hotels take a free pilot by
   8 December, we stop the hotel wedge and test selling through robot makers."** Hold up the printed
   A4 last (design and product review): "This page is what hotel number one gets on Monday, without a robot."

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

- [ ] **Run the production build on the demo laptop, not `next dev`** (security and data review):
      `npm ci && npm run build && npm start`, then http://localhost:3000, with `.env.local` as in § 4.
      Then the CSP a juror can inspect has no `'unsafe-eval'` and no `ws://localhost`, and the session
      cookie is `Secure`. Build in its own checkout, not in a worktree where a dev server is running
      (`next build` rewrites `.next`). **Check the login once under `npm start` in the demo browser**
      (a `Secure` cookie on http://localhost: current Chrome and Firefox accept it; to verify on the
      laptop). Say it once in Q&A: "You're looking at the production build."
- [ ] **Log in on the demo laptop before the slot**, as `siri`, in the browser that will be on
      the projector; open Overlevering, at the top, zoom set (1440 px at 110–125 %).
- [ ] **A second tab, already logged in,** on Overlevering in the same browser (same session cookie;
      12 h). If the first tab stalls, switch tabs; never log in again live.
- [ ] **Backup account, logged in in a second browser** (or a private window): `hamad`, on Overlevering.
      If `siri` is locked out, present from it (the stamps then read Hamad's name; say so).
- [ ] Clear rehearsal ticks: *Angre* on 213 (back to the start, ticks and name cleared) and on the
      sign-off, so the page starts unconfirmed and unsigned, and the source switch on *Med robot*
      (they live in this browser's `localStorage`). **Never press *Angre* on the night clerk's sample
      entries on the demo laptop** (owner B): an *Angre* appends a correction, and 213 under *Uten
      robot* drops back to *sjekk rommet* (one signal, the lock alone, never sells). Tap *Uten robot*
      once before walking up and check that 213 says *Bekreftet av to kilder*. If the switch ever
      fails on stage, `/overlevering?kilde=uten-robot` opens the same view.
- [ ] Tell jurors who try the `jury` account to type carefully: their mistakes count against the same
      address as the presenter's.
- [ ] Recorded video (§ 4) open in a third window, paused on frame one.

## 5. Submission checklist (CONTEXT § 2 and § 11; deadline Sun 14:00, repos lock at the last commit)

- [x] Agent code merged to `main` (CONTEXT § 11: "the agent code must be on `main`"), including the
      replay bed (`agent/replaybed.py`): **done 05:59 Sun**, PR #25 (`hamad/final-to-main`), merge
      `93f71d4`; `agent/` on `main` is `8de9ffc`'s byte for byte (the dress-rehearsal build). If
      `hamad/final` moves before 12:00, merge it again.
- [ ] The jury-loop app merged to `main` and deployed, if the team lead says so; the deployed URL shows
      the screens in § 2. Until then the only public deployment (`lobby-sandy.vercel.app`) serves `main`: the old name
      *Lobby* and an older CSP without `connect-src` (curl, Sun 02:50). A security juror will curl it;
      the README says so, and the demo runs from the laptop.
- [ ] Name: the team lead decides whether `main` trades as Fettero (this branch does). The trademark
      search (Patentstyret, EUIPO TMview, WIPO; classes 9, 42, 43; the Ferrero question) is still to
      do: `docs/PRIVACY.md` § 9.
- [ ] The ElevenLabs receptionist's live retention checked in the dashboard and dated in
      `docs/PRIVACY.md` § 4 (team).
- [ ] The receptionist's first message tells a phone caller where the call goes and for how long
      (`docs/PRIVACY.md` § 6, the proposed first layer; ShirazIQ's prompt), the "10 % cheaper than the
      booking sites" line cut or dated, then the agent setup re-run (`src/features/reception/setup-agent.ts`)
      so the live agent carries it; the live ElevenLabs agents also keep the old work-guide wording
      until their setup is re-run (owner E's note; team).
- [x] Both forecasts committed **before 12:00** with their timestamps (`docs/runs/forecast.txt`): the
      model's for `8de9ffc` (05:50, median 2,050, 80 % 1,759–2,393) and the rehearsal's (06:44,
      `c6b8c54`, median 2,170, 80 % 2,055–2,301).
- [ ] After 13:05: the final's mean of the best 9 of 10 next to both, in § 1.1, on the card
      (`FINAL_RESULT` in `scripts/forecast.py`) and in the data review's answer (data review).
- [ ] A team e-mail address for the print footer and the README (founders and marketing review: a leave-behind nobody
      can reply to doesn't do its job). None exists yet; don't invent one.
- [ ] Repo access for the jury: **add the jury as collaborators; don't make the repo public**
      (legal review): `docs/` holds the organisers' decks, Wybe's guide and Holio's challenge PDF, and making
      the repo public would redistribute third-party material (team lead's decision, CONTEXT § 11).
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

### 6.1 The review questions (round-5 reviews, Sun 8 Nov about 06:00) and the honest answers

These questions come from our own structured reviews, one per judging field, AI-assisted; they are not
the jury's words, and no reviewer is named here. Each review brings one question from its field. The
answer is what we can say **truthfully today**; **[fill]** marks a fact the team must supply first,
**[if]** a line to say only if it is true by then, **PENDING** a result still being measured. If a
[fill] stays empty, say the honest version given after it. The two design reviews ask the same testing
question: give both the same numbers. What drops any answer to 6: robot numbers where the question is
about hotels, "hours saved", a percentage from a handful of calls, or a number that isn't in a file.

**Security review (IT and security).** *"What is your biggest technical risk, and what's the one thing an
attacker or a hotel's own IT would get past today?"* (Hamad)

> "Two honest ones. First, sessions are stateless 12-hour HMAC tokens and the team's accounts share
> one password (the jury has its own, made for the event and deleted after it). A leaked token stays
> valid until it expires or we rotate the secret, which logs everyone out. So the named security step
> before hotel one is one account per person with its own password, and sessions we can revoke one by
> one; it's on the business slide. Second, our limiters live in memory per server instance, so on
> serverless N instances allow N times the limit. [if set in both consoles: 'The hard ceiling is a
> provider-side spend cap at Anthropic and ElevenLabs.'] [if not: 'The provider-side spend cap is the
> one layer not set yet.'] The data and paid routes check the origin themselves, a 403 before the rate
> limit or any backend, so it's defence in depth, not SameSite alone. Forged cookies fail the HMAC in
> constant time, login is enumeration- and CSRF-safe, every paid route is limited before it costs a
> cent, and this is the production build: `default-src 'self'`, no eval, a Secure cookie. Inline scripts
> are still allowed, because Next.js streams its page data inline and the nonce is phase three;
> `object-src 'none'`, `base-uri 'self'` and `frame-ancestors 'none'` are the containment today. The
> public URL still serves Saturday's `main` with an older header, and the README says so."

Show it (30 seconds): DevTools on Overlevering → the response headers (the CSP), and a logged-out tab
on `/api/reception/calls` → 401 JSON. Or, as `siri` (admin), switch the view to *robot* and open
`/oversikt`: the server answers 403 *Ingen tilgang*.

**Data review (data and ML soundness).** *"Your card holds the demo night's nine own-judgement claims to
the robot's own log and finds one, 209, that doesn't hold. Next to it you print 64 of 65 across the
final branch. Did you run the same rule over those 65? And when you injected failures, what share did
the check actually catch, not precision over all the dones?"* (Hamad)

> "We ran it after the review, over every night in the ledger. By the same rule, **54 of the 65**
> distinct own-judgement claims hold against the robot's own log, a 95 % interval of 72 to 90 %,
> against 64 of 65 the simulator credited. Ten of the eleven are rooms it reported empty after it had
> placed something inside them itself that night; the simulator credits 'empty' because its look no
> longer lists what was delivered. The eleventh is the spill on seed 23 it never credited. So the
> referee has a blind spot right on the money step, and the card shows both numbers. On the dress
> rehearsal's ten never-played seeds, the build that plays at noon: 101 of 101 credited, **88 of 101
> hold against its own log**; 13 of its 64 room checks are contradicted, on 8 of 10 nights, and the
> simulator credited all 13. In the fault test the check **caught 79 % (251 of 317) of the failures we injected**
> at a 5 % failure rate, 88 % without the sleeping-guest type. Precision there is 98.5 %, but
> precision moves with how often things fail, so we lead with the catch rate. It misses three kinds
> completely: a guest asleep in a room it checked, a polite off-topic reply, music that starts again.
> And we committed a second forecast before noon, from the rehearsal alone: median 2,170, 80 % between 2,055 and 2,301, next to the model's 2,050, 1,759 to 2,393. [after 13:05: 'The final came in at [Y].'] The pilot's first deliverable is the same
> table against the hotel's lock log, split by rooms that had a delivery that night."

Follow-ups it may bring:

- *"Did you write the PMS test data after you saw the log?"* "Yes, and the screen says so. 209 doesn't
  need it: the robot's own log contradicts its own report. 213's booking is test data, labelled; in a
  pilot the booking system is the hotel's, read-only."
- *"Can I regenerate your ledger?"* "The script is in the repo and `--check` says whether the committed
  files are current; the logs are on Hamad's laptop, not in the repo, so today it runs only there."
  Committing the logs behind the headline numbers, or their hashes, is the fix; not done.
- *"The sim is deterministic."* "Yes: the same code on the same seed scores the same, so the
  uncertainty is between seeds. `cb72845` → `8eac151` was +53, −1, −94, −25 on four seeds: a mean of −17
  with a standard error of about 31. Four nights can't separate ±20."
- *"Are your room checks falsifiable?"* "In the sim only against the robot's own log, and that's what
  the rule does: its look returns ground truth as text, and it drops what the robot delivered. That's
  why perception comes last in a hotel: the lock trail, the energy slot and the PMS first."
- *"How accurate is the camera?"* "Not measured. The confidence is the model's own label, not
  calibrated; when it's unsure a person picks between the products it could be." [or: fill from a
  20-item run]

**Marketing review.** *"Name the first hotel that gets your Monday e-mail. Who did you speak to there,
what did they say in their own words, and when that general manager clicks or scans what you sent,
where does she land and what do you count?"* (ShirazIQ)

> [fill from § 8.1, raw counts only] "This morning at [time] we called [10] Oslo hotels of 60 to 200
> rooms and reached [N]. [M] hand over in a paper book or PMS notes. [K] said yes or maybe to four free
> weeks, no robot needed, and the words we heard most were '[their words]'. The first e-mail goes Monday
> to [a hotel, named only if they agreed]. We count a user as someone who signs every shift they work,
> and a hotel as active when 5 of 7 mornings are signed, which is also what converts the pilot. They
> told us about [S] people sign a week, so 100 users is about [100 ÷ S] hotels, about [N] conversations
> at this morning's rate. Hotel one goes live on 16 November, before the julebord peak, and our stop
> rule counts conversations held, not the calendar."

Honest version if the round wasn't run (6 from this review): "We haven't asked a hotel yet. The slide
shows the arithmetic with the gaps marked: 100 users is hotels times signers per hotel, and both the
signers and the yes-rate come from calls we haven't made. What's fixed is how we count: a person who
signs every shift they work, a hotel signed on 5 of 7 mornings. There's no address or QR on the
leave-behind yet, so nothing is counted yet; that's the first thing after the calls."

**Domain review, robots (Wybe, the Night Shift challenge).** *"Your robot slipped on corridor 2B at 23:51,
and your page tells Siri at 06:00 that nobody was told. Put one of our robots in a hotel through you on
Monday: who gets that wet floor at 23:51, how fast, and how does your page prove it reached them?"*
(Hamad)

> "At 23:51 the robot's hazard line lands on the night clerk's own screen, *Nattevaktens logg*, in the
> box *Fra roboten*, at the robot's clock. She taps *Kvitter*, and that tap, her name and the time, is
> the outside signal our rule asks for. [Show `/natt`.] At 06:00 the handover counts the wait from the
> robot's report to the first person who acknowledged it. On the demo night nobody did, so the row
> reads *Korridor 2B siden 23:51 · roboten skled der · 6 t 9 min uten at noen ble varslet*, and the
> manager's first button is *Varsle Trond Eikeland*, which records who was told and when. That wait,
> from the hazard to a person, is the number we'd measure for every robot, ours or yours. What isn't
> built: a push to her phone at 23:51 and an escalation after ten minutes; today she sees it when she
> opens the screen. Give us one night of your robot's log, in any format, and you'll see it on this
> page within 48 hours."

Follow-up, *"Which build plays at noon, and which would you put in a real hotel?"*:

> "`8de9ffc` plays: the head of `hamad/final`, and the agent on `main` since 05:59 as the submission
> requires. Why: it's the build we measured on ten seeds no build had played, best 9 of 10 at 2,176,
> inside the forecast we committed before it, and your final scores the game. In a hotel only the
> hotel-rules build runs. On your server this morning, four nights, it cost 82 points a night, 2,509
> against 2,591, and knocked before 59 of 59 keycard entries, against 26 of 61 for the final build on
> the same seeds; in our replay bed, 164 nights, almost all of the cost is never moving a sign off a wet
> floor with three in store. The knock isn't politeness, it's a sensor: a voice behind the door stops
> the entry. And what it still gets wrong: on two of those four nights it ended the shift at a lift, not on the charger, and on two it still held the master keycard at 06:00. On seed 16, the hotel-rules night on Natteskift, the card says so itself: on the charger, keycard in hand. So on a side branch there's now a fifth rule, home by 05:45: the keycard back at the desk, then docked. In our replay of 202 real nights it brought the keycard back on all 202 and cost 90 points a night; it hasn't run live, and it isn't in the build that plays. Our page lists the robot's 06:00 state as an item with an owner either way."

Don't say "we switched off the sign move": `sign_move` is still in `DEFAULT_EXPERIMENTS` on
`hamad/final`. Sim-to-real gaps to name before they're asked: in a pilot the robot doesn't open booked
rooms with a master keycard (occupancy comes from the lock's per-room signal and the energy slot), keys
ride in a locked compartment, and lifts need a per-building integration, the pilot's hard part.
Deployed hotel robots are mostly compartment robots, and the run log already has `compartment` and
`guest_ack`: the Open-RMF sample on Natteskift is shaped like them. Sources for the robot history:
[Relay Robotics, 2022](https://www.businesswire.com/news/home/20220627005165/en/Relay-Robotics-to-Showcase-Newest-Service-Robot-at-Worlds-Largest-Hospitality-Tech-Conference-HITEC-Orlando);
[IFR 2025](https://ifr.org/ifr-press-releases/news/service-robots-see-global-growth-boom);
[Hotel Management, "Japan's Henn na Hotel fires half its robot workforce"](https://www.hotelmanagement.net/tech/japan-s-henn-na-hotel-fires-half-its-robot-workforce).

**Legal review.** *"Your slogan is 'ett signal per rom, aldri hvem'. On your own night clerk's screen,
room 212 said Petter Aas, and that his card went into the slot at 00:35. That's who and when. Which is
it, and what legal hurdle could stop a hotel from sending you even the one signal?"* (Hamad, about 40 s)

> "You found what we found, and it's fixed on this build. A card in the slot is a yes with no clock,
> 'no card' means since six in the evening, and the night clerk sees the lock line only where the lock
> and the booking system disagree. Tap 212 now: *booket til 9.11*, no name, and *bank på og vent*
> before she goes in. Only on a flagged room, 213 or 210, does she see a name, because there she is
> checking a departure. The hurdles, in the order they bite. First the contracts: the lock vendor's
> licence on exporting even a derived value, and the PMS vendor's partner agreement; we haven't asked
> a vendor yet. Second, the hotel's purpose test, Article 6(4), with a legitimate-interest balancing
> beside it: one page, PRIVACY.md section 10. Third, arbeidsmiljøloven chapter 9 if staff cards ever
> reached us; they're removed at the source, so it isn't a control measure. Fourth, a DPIA, because we
> combine datasets and touch employees: two pages, still to write. Retention is in the code: the night
> clerk's log keeps 30 days on the device, and the DPA deletes the lock signal 24 hours after the
> handover. A wet floor records whether a sign went out. We sign the Commission's Article 28 clauses,
> and Anthropic and ElevenLabs are off in the pilot. The name hasn't been searched yet; that comes
> before anyone puts money into it."

Background if it digs (`docs/PRIVACY.md` § 3.1, § 6, § 7, § 9, § 10):

- **In force in Norway today:** personopplysningsloven; arbeidsmiljøloven chapter 9; forskrift om
  kameraovervåking i virksomhet (FOR-2018-07-02-1107); produktansvarsloven; markedsføringsloven;
  skadeserstatningsloven § 2-1 for the employer's liability.
- **EEA status, read on EEA-Lex Sun 8 Nov:** the AI Act is "under scrutiny for incorporation", so it
  doesn't apply in Norway yet (we follow Art. 50 anyway: the receptionist says it is an AI); the
  Machinery Regulation is taken in by Joint Committee decision 171/2025, entry into force pending; the
  Product Liability Directive (EU deadline 9 Dec 2026) is under scrutiny. Under it, liability to an
  injured guest can't be capped by contract, so the safety case comes before the first pilot.
- **The DPF:** the General Court dismissed *Latombe* (T-553/23) on 3 Sep 2025; an appeal is reported
  (to verify). ElevenLabs and Vercel are on the list; Anthropic relies on the SCCs in its DPA, and the
  pilot doesn't use Anthropic or ElevenLabs at all.
- **Safety as evidence of care:** a safety item reads *straks* with how long it waited for a person (*6 t 9 min uten at noen ble varslet*), and *Varsle* records who was told and when; a wet floor the night clerk reports records whether a sign went out (*Skilt satt ut? Ja / Nei*), and the robot's hazards reach her on `/natt` with a *Kvitter* (`docs/PRIVACY.md` § 7). A name-free safety extract for the three-year limitation period is a proposal (foreldelsesloven § 9).
- **The phone caller's notice:** a known gap, a team item (`docs/PRIVACY.md` § 6).
- **The name:** the searches at Patentstyret, EUIPO and WIPO are still to do (§ 9). [if done: 'They're
  clear in classes 9, 42 and 43 as of [time].']

What earns the 10 (PENDING): one hotel's DPO or one lock vendor saying yes to the derived signal, by
name and date.

**Product review.** *"You built fifteen screens and showed one. What did you cut to get to this page, and
what on it did a real night manager tell you she would miss?"* (ShirazIQ, about 40 s, with the page on
screen)

> "Three cuts, each with its reason. Writing to the PMS: the pilot is read-only and the PMS stays the
> truth, so our button stops at *Send til resepsjonen* and waits. A shared backend: a pilot is one
> desk, and the sign-off becomes an append-only event in phase three. And everything else we built,
> folded here under *Utenfor piloten* [point at the menu]: the camera, the voice receptionist, routes,
> built for the prize tracks, not for this buyer. What a night manager told us: [fill from § 8.1: 'this
> morning we called [N] night desks; [X] of [N] write the handover in [PMS notes / a paper book]; one
> said "[their words]"'] [if the round wasn't run: 'nobody yet; the calls are the next thing we do'].
> What's still not right: the varsling and the sign-off are stored on this device only; in a pilot they're server events. And *Kvitter mottatt* says when a safety item was never told to anyone, but doesn't block: the manager decides."

What drops it to 6: answering with the robot's numbers, "we didn't cut anything, it's all built", or a
user quote that isn't in § 8 with a date and a count. If it asks the round-4 question ("take every
robot line off this page: what's left, who typed it, which number?"): tap *Uten robot*; the door lock,
the booking system and Kjersti's taps are what's left; the number is mornings signed (5 of 7, the
conversion rule), with the minutes from 06:00 to the first room sent to reception beside it.

**Design review (two reviews, one field: creative and design).** *"How have you tested this with users,
and show me one thing a real person got wrong on this page and what you changed because of it."*
(ShirazIQ)

> [fill from § 8.2, raw numbers] "This morning we put [three] people who had never seen Fettero in front
> of this page, cold, with four tasks and a stopwatch. [N of 3] found the room they could sell in [S]
> seconds; [where the others got lost], so we changed [one thing] (commit [`…`]), and [two new people]
> then found it in [S] seconds. The raw notes are in DEMO.md § 8.2. What we haven't done is watch a real
> 06:00 manager use it in a real hotel; that's Monday, with their own night printed on one page."

Honest version if § 8 wasn't run (both cap it at 6): "Not with users yet. We ran structured reviews of
every screen, AI-assisted, one per judging field, and changed what they found: the money step is the one orange action, the four figures jump to their rows, the test-data labels became one quiet band, 209 shows its two times instead of a sentence, the 210 and 213 rows show their sources as chips, and *varsle nå* became a button that records who was told. That's
review, not testing; a hallway test is the next thing." Why this look: a calm operations tool for 06:00.
One grotesk and one mono, light working screens, night steel for the robot's world, one orange action
per screen, states always in words, red and amber only for what needs a person (`DESIGN.md`).
Accessibility in one sentence: a skip link, a visible focus ring, contrast that passes, states in words
as well as colour, and 44 px touch targets. The name: "Fettero is our team's coined name; the line says
what we do." Said aloud it is close to Ferrero (`docs/PRIVACY.md` § 9), so say the line right after the
name.

**Domain review, warehouse (Holio).** *"hotelkit, Quore and ALICE already sell a shift log to thousands of
hotels, and Mews now owns Flexkeeping. On Monday, what does your page do that a hotel with hotelkit
can't already do, and who outside this building has told you they want it?"* (Hamad)

> "Those tools own the shift log and the task list: what people write and tick off, and they do it
> well. Fettero checks what was written. In hotelkit, 'room 213 empty' is a claim someone typed. Here it
> counts as confirmed only when a second system agrees: the door lock and the energy slot, or the night
> clerk's look against the booking system. None of those tools reconciles the booking system with the
> door lock, or a robot's log with what the robot did. And we hold the robot to the same rule: it said
> 209 was empty, its own log says it carried bags in, so we held the room. That's your warehouse rule:
> 'done' means the scanner confirmed it. hotelkit could build this, but it needs the PMS and the lock
> in one record, and each vendor owns one silo; we start read-only on Mews and Apaleo where the locks
> are online, and on the night clerk's tap where they aren't. Who told us: [fill from § 8.1: 'this
> morning we called [N] receptions: [X] hand over on paper or in a chat, [Y] have online locks, [Z]
> said yes to a free pilot'] [if not run: 'nobody outside this building yet; that's step one']."

Without the bracketed numbers from a real call, the same answer earns a 7: the logic is right, but
there's no evidence of demand.

At the Holio stand: *"Hand me this unlabelled T-shirt in a polybag. Which size is it, how sure are you,
and what happens when you're wrong?"* (ShirazIQ)

> "Honestly: it can't tell M from L. Our catalogue has no variants, and a reader of the text on the
> pack can only read the size if the sticker is legible. When it isn't sure it says so, *Usikker*, and
> shows the two or three products it could be, each with its description and shelf; the worker taps
> *Ja, det er denne* or *Ingen av disse*. Nothing goes on the pick list or gets a route on the camera's
> word, and *Ingen av disse* becomes an avvik with an owner and a deadline on the morning handover. In a warehouse the
> candidates should come from what's expected, the purchase order at receiving or the customer's order
> at returns, plus the shop's own product photos: that's where accuracy jumps, and it isn't built. And
> it isn't measured yet, so I won't give you a number."

Full status per pain: `docs/HOLIO.md`.

**Founders review.** *"If you win tonight, what happens on Monday at 09:00, with whom? And what did the
hotels you called this morning actually say?"* (Hamad)

> [fill from § 8.1] "This morning between [times] we called [10] Oslo hotels in our band and reached
> [N]. [K] hand over on paper or in PMS notes, [Y] said yes or maybe to a free pilot, and they find a
> room like 213 at [time], about [n] a week." [if not run: "We haven't talked to a hotel yet; Monday's
> first job is the calls."] "On Monday at 09:00 ShirazIQ calls back every yes and maybe with their
> night printed on one page and the data agreement, and Hamad starts the read-only connector to Mews or
> Apaleo and the server event for the sign-off, because our conversion rule needs it: a pilot converts
> at 30 kroner a room when the handover is signed on 5 of 7 mornings in 3 of the 4 weeks and the GM says
> yes. Hotel one goes live on 16 November with the PMS and the night clerk's taps; the lock comes when
> the lock vendor agrees. The money that's certain on this night is 210: in use with no booking, a night nobody bills and a room the system could sell again today, about 1,500 kroner. 213 is five hours earlier, and kroner only if the night sells out. We both work full-time for four weeks; if fewer than 2 of the
> first 10 hotels we speak to take a pilot by 8 December, we stop the hotel wedge and sell through robot
> makers. The 50,000 kroner is runway. [team to confirm before saying it: 'We register Fettero AS on
> Altinn on Monday.']"

Honest version if the calls didn't happen (6 from this review): "Nobody outside this building has told
us yet; that's Monday's first job." What drops it to 5: defending the 1,500 kroner as a room-night that
would otherwise be lost.

**Domain review, robots and founders (Wybe).** *"Your card catches 209 on the demo night. How often does
that happen with the build that plays our final today, and why doesn't the robot catch it itself?"*
(Hamad, about 40 s)

> "Often. We ran the same rule over the final build's ten never-played rehearsal nights: 13 of its 64
> room checks are contradicted by its own log, on 8 of 10 nights, and your referee credited all 13. On
> its own judgement 88 of 101 'done' hold against its own log, not 101 of 101; over the final branch's
> claims, 54 of 65 against 64 of 65. The demo night's one in nine is typical, not lucky, and it's the
> case for a check outside the robot. The robot didn't catch it because it never compares a room check
> with what it placed in that room itself, and in your sim 'empty' is what pays, while your look drops
> the bags it delivered. On a side branch it now does: the room check's note says NOT EMPTY and names
> its own bags. In our replay of 202 real nights that fired 368 times on 190 nights and cost 0 points,
> and live your simulator thanked 389 of 390 room checks of rooms the robot had carried bags into. So
> your points reward what a hotel would forbid, and Fettero shows the hotel what the robot did instead
> of trusting the score. Not in the build that plays. That's your simulator's gap, not a camera miss, and we don't defend it as one.
> In a hotel the signal that catches it isn't a camera at all: the delivery in the lock trail or the
> PMS assignment, and a person confirming before anything is sold."

If it asks the field's standard question instead, *"Why hasn't anyone solved this before?"*:

> "Delivery is solved inside each vendor's cloud: compartment robots verify a delivery with the guest's
> PIN and a lid sensor. What isn't solved is everything that isn't a delivery, a room check, a hazard, a
> refusal, joined with the lock, the PMS and the staff. A hotel has one or two robots, so no vendor has
> a reason to build the cross-vendor layer, and the ops tools, hotelkit, ALICE, Flexkeeping, keep text
> logs without evidence tiers. Our run log is that layer: here it is on an Open-RMF night too."

If it follows with "what's next if you win": the Wybe-stand answer as given **[fill]**, the number of
hotels with online locks from the phone round **[fill]**, and the stop rule. Prior art to name:
delivery robots since about 2014 (Savioke, now Relay Robotics), Pudu and Keenon; ops and handover
software (hotelkit, Quore, ALICE, Optii, Flexkeeping); locks and energy systems that already see
occupancy (ASSA ABLOY, Salto, dormakaba).

### 6.2 Other likely questions

| Question | Answer | Who |
|---|---|---|
| Is this live or hard-coded? | Live app with login. The night is a real practice night our final agent played against Wybe's server; rooms, requests, routes, the 3D map and the handover are computed from its log through one selector. Bookings, guests, staff, stock and prices are test data, and every list says which is which. | ShirazIQ |
| Why Fettero, not Lobby? | Lobby is a funded Zurich hotel-AI company (USD 2.2 M, Mar 2026) sold through Apaleo's Agent Hub, our planned channel. Fettero is coined and already our team's and robot's name. The team lead decides whether `main` follows. | ShirazIQ |
| Doesn't the PMS do this? | The PMS automates the night's accounting (Mews has no night-audit button). Room discrepancies in OPERA or protel are fed by housekeeping in the morning. Nobody puts a robot's night, the phone and the staff into one signed handover. | Hamad |
| 85 requests a night in a 36-room hotel? | That's game density. A real hotel sees a handful of night requests, which is why we price on rooms found and released, not on tasks or hours saved. | Hamad |
| What if the robot calls a room empty and the guest's bag is behind the door? | That happened on the demo night, and it's the first thing on the page: at 01:29 the robot carried bags into 209 itself, and at 03:47 it reported 209 "empty and tidy", which the simulator credited. Fettero checks the robot's report against the robot's own actions and holds 209 back, with no booking needed; the card counts it as a miss (8 of 9). A room goes to reception only after a named receptionist confirms the folio, the bags and the key card. | ShirazIQ |
| Is the money real? | It's gross room revenue at last night's average rate in the test PMS (NOK 1,467), for a real sleeper: 213's guest was due out yesterday and the check-out was never recorded. Housekeeping would find it by late morning, so what Fettero buys is hours: the kroner are real only if the night sells out (the demo hotel has 31 of 36 booked tonight) or for an early check-in; Oslo sold 72 % of its rooms in 2025 at NOK 1,631 a room (SSB table 14169). Say "on the demo night", never "per night". | Hamad |
| Doesn't the night audit catch 213? (product review) | The PMS knows the booking, not the room: its due-out report can't tell "left without checking out" from "still asleep, extended at the desk". The missing piece is physical evidence: the lock, the energy slot, a look inside. We ask hotels when they find such rooms today (§ 8.1 Q3). | Hamad |
| Why doesn't Mews or the lock vendor just build this? (founders review) | They could build the page; each sees only its own silo. Our piece is cross-vendor evidence in one signed record: the staff, the lock, the phone and any robot. "Nobody positions on trust" is positioning, not a moat, and we say so. | ShirazIQ |
| What does the robot add that the lock doesn't? | Its own night as evidence: what it delivered where (bags for three arrivals in 212 is now an open item for the desk), hazards with place and time, refusals of a stranger, and its own faults (10 of 15 master-key entries without a knock). Finding sleepers is the lock log's job, which is why hotel number one needs no robot. | Hamad |
| What would you cut first? | Already cut: linen counting by camera, voice-to-work-order, translation between guest and staff, a database, the red alert band. Kept: one handover story that runs end to end. | ShirazIQ |
| Where did "Timer spart" go? | Off the screens in round 4, on Oversikt and in the host view: it was an estimate (tasks × assumed minutes) on a first screen that should carry only what the data proves. The pilot measures minutes from 06:00 to the first room released instead. | Hamad |
| Who is Siri? Her plate says *Admin*. | The demo persona, a morning manager; the account is an admin so it sees the whole pilot menu. | ShirazIQ |

## 7. The business slide

Proposals the team presents as hypotheses, not facts. Every outside number links to its source.

**One wedge (decided Sun 8 Nov): independent and chain hotels of 60–200 rooms, software first, the
robot optional.** Hotel number one needs no robot: Fettero reads its booking system (**read-only: the
pilot never writes to the PMS**; a room goes to reception, and reception changes the booking), one
signal per room from the door lock and the energy slot (never who: `docs/PRIVACY.md` § 10) and the
night clerk's own entries on her phone, and the 06:00 page comes out. On screen: Overlevering's switch
*Med robot | Uten robot* builds the same page without a single robot line (§ 2). When a hotel has a
robot, its log is one more source of evidence on the same page. **Where the lock can't help:** many
hotels run offline locks, whose audit trail is read at the door with a handheld, and no networked room
control; there the night clerk's room check is the evidence, and the robot is the automated version of
it. How many target hotels have online locks is a phone-round question (§ 8.1 Q7); until then we
don't claim the lock signal for every hotel. **The reason, in one sentence:** the
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

**What Fettero buys is hours, not a room-night (founders and domain review).** Every hotel already has two nets
for a sleeper: the end-of-day routine and housekeeping's morning round, which finds an empty room with
no bags by late morning. So the money line on screen says what is true: the room was *found free hours
earlier*, worth about NOK 1,500 **if the night sells out**, with tonight's bookings beside it (the demo
hotel is not full: *31 av 36 booket i kveld* sits under the money figure). On the demo night that is one room to send to reception
after the desk confirms (213: the guest was due out yesterday and the check-out was never recorded, so
the booking system still held the room; NOK 1,467, last night's average rate in the test PMS) and one
held back (209: the robot's own log contradicts its "empty" report). It's gross room revenue, and it
is extra money only on a night the hotel sells out (2025: 57 % of Norway's hotel rooms sold, 72 % of
Oslo's; SSB table 14169), so the price must also pay on early check-ins and an earlier clean. How many
nights a month a hotel sells out, and when its housekeeping finds a sleeper today, are phone-round
questions (§ 8.1 Q3, Q3b). Room prices below are SSB's 2025 averages per room sold (table 14169):
Norway NOK 1,471, Oslo NOK 1,631.

| Hotel | Price a month | Equals | Pays for itself when |
|---|---|---|---|
| 60 rooms | NOK 1,800 | 1.2 room-nights at Norway's NOK 1,471 (1.1 in Oslo) | about one sleeper a month found before housekeeping, on a night that then sells out (or an early check-in sold) |
| 100 rooms | NOK 3,000 (NOK 36,000 a year) | 2.0 room-nights at NOK 1,471 (1.8 in Oslo); about two rooms like 213 on the demo night (2 × NOK 1,467) | two such rooms a month |
| 200 rooms | NOK 6,000 | 4.1 room-nights at NOK 1,471 (3.7 in Oslo) | four such rooms a month |

**The pilot's conversion rule: on usage (proposal, team to confirm; founders review).** The free
four-week pilot converts at NOK 30 a room a month when the hotel **uses** it: the 06:00 handover signed
in Fettero on **at least 5 of 7 mornings in 3 of the 4 weeks, plus the general manager's yes** at the
end. That is the same rule as an *active* hotel below, so the pilot and the first-100 slide count one
thing. Rooms found before the housekeeping round, and the minutes from 06:00 to the first room sent to
reception, are the numbers we report beside it, not the gate: a hotel with one sleeper a month would
otherwise "fail" a pilot its staff sign every morning. **What it needs, and isn't built:** today
*Kvitter mottatt* is kept on one device, so we can't yet measure our own rule. In a pilot every
sign-off is one append-only event on our server (hotel, role, date; no guest data), `TODO(phase-3)`,
the first week's build task. Offered beside it: *paid from day one, money back if the rule isn't met*.
A free pilot with no exit rule is how founders lose a quarter.

**How big, honestly (founders and marketing review).** Norway has 92,678 hotel rooms (SSB 14164, Sep 2026). At NOK 30
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

What they do and what they don't: **hotelkit, Quore and ALICE own the shift log and the task list**,
the handover as text that people write and tick off, and they do it well in thousands of hotels. They
don't check what was written: none of them reconciles the booking system with the door lock, or a
robot's log with what the robot did. **Compartment delivery robots already verify a delivery** inside
their own cloud (the guest's PIN and a lid sensor). Nobody verifies the tasks that aren't deliveries (a
room check, a hazard, a refusal), or joins them with the lock, the PMS and the staff. That gap is
Fettero's.

**The pitch line for this slide (marketing review):** ***Fettero finner rommene der bookingsystemet
og dørlåsen er uenige — før renholdet gjør det.*** (Fettero finds the rooms your booking system and
your door locks disagree about, before housekeeping does.) It is the hotel-one differentiator and needs
no robot; on screen it is *Sjekk disse først* on `/natt` and the 213 and 210 rows on Overlevering. It is
true where the locks report at night, so the phone round's Q7 says for how many hotels (§ 8.1).

**Why we win.** The only handover that merges the night staff, the AI phone and the robot into one
signed page; "confirmed" needs a signal from outside the robot (the door lock, the guest, the staff,
the PMS), and refusals and misses are shown; and the run log is vendor-neutral, so any robot that
writes it gets the same screen. Every competitor says "operating system" or "AI platform" and claims
hours saved without the arithmetic; nobody positions on trust in autonomous work. The defensible piece
is cross-vendor evidence in one signed record: a PMS or a lock vendor sees only its own silo (and Mews
bought Flexkeeping, so the page alone is a feature they could ship).

**Two lines for the slide and the staff (design review).**
- ***Fettero signerer for nattevakten, ikke på henne.*** (Fettero signs for the night clerk, not on
  her.) The page counts the robot's faults, never a person's; staff cards never reach us
  (`docs/PRIVACY.md` § 10.3). It is the sentence a hotel's *tillitsvalgt* needs before the first pilot.
- **The tagline image:** the night clerk's note on the page reads ***«Rolig natt.»***; beside it the
  log has three wet floors without a sign and a man in a bathrobe at seven doors. Said kindly: "From the
  desk it *was* a calm night. The robot saw the rest." That is *Natten, ærlig overlevert.* in one
  picture (Overlevering, *Dette skjedde i natt*).

**The commitment and the stop rule.** Both of us work on this full-time for four weeks from Monday
9 November. If fewer than 2 of 10 hotels take a free four-week pilot by 8 December 2026, we stop the
hotel wedge and test selling through robot makers instead.

**The julebord season against the stop rule (marketing review).** Mid-November to mid-December is the
busiest stretch of a Norwegian hotel's year: the most sold-out nights, which is when an earlier room is
real money (*i julebordsesongen er hvert rom penger*), and the weeks a manager has least time for a
pilot. 8 December falls inside it, so a low yes-rate in those weeks may be the season, not the product.
Two consequences (proposal, team to confirm): hotel 1 goes live on **16 November, before the peak**; and
the stop rule counts **conversations held, not the calendar**: the "2 of 10" is 2 pilots out of the
first 10 hotels we actually spoke to (a manager or the night desk, not a call that rang out). If we
haven't spoken to 10 by 8 December, the check waits until we have, and we say so.

**Channel, in order** (the wedge decides it: hotels first, the robot later).
1. **Direct** for hotel 1: from Sunday's phone round (§ 8), a visit with a printed Overlevering of
   their own night. The printed page carries the name (*Fettero · Natten, ærlig overlevert. · Team Fettero, Oslo
   Sprint 2026*; no contact address on it yet), so it works as the leave-behind;
   print the demo night (*Skriv ut*) and hold it up in the final: "This page is what hotel number one
   gets on Monday."
2. **Robot makers** (Wybe, on this jury, and others), for the hotels that have a robot: Fettero is the
   manager's page their robot's log feeds. Ask Wybe one concrete thing at the stand before 14:00
   (domain review): "Give us one night of your robot's task log, in any format, and we render it on
   Overlevering within 48 hours." And: "Would you put this handover in front of one pilot hotel's
   morning manager for two weeks?" Write the answers down as given.
3. **PMS marketplaces**: Apaleo's Store and Agent Hub
   ([Hospitality Net](https://www.hospitalitynet.org/news/4126037.html)) and Mews' marketplace
   ("1,000+ hospitality apps", [mews.com](https://www.mews.com/en)). Flexkeeping went from marketplace
   app to being acquired by Mews: the route exists. VisBook, the Nordic PMS with 1,000+ tourism
   businesses ([Standout Capital](https://www.mynewsdesk.com/se/standoutcapital/pressreleases/standout-capital-invests-in-visbook-to-accelerate-long-term-growth-2838655)),
   reaches independents in one integration.
4. **Independent hotel groups**: De Historiske, about 70 hotels
   ([NAF](https://www.naf.no/medlemskap/medlemsfordeler/kortferie-med-de-historiske-hotel-and-spisesteder)).

**Next step if we win tonight.** Monday morning: call back every hotel that said yes or maybe on
Sunday, with a printed Overlevering and the one-page data processing agreement (`docs/DPA.md`, a draft
on the Commission's Art. 28 clauses; Fettero must be registered as a company before it is signed).
Offer a free four-week pilot, software only: Fettero reads the hotel's PMS (read-only, Apaleo or Mews
first), one signal per room from the door lock and the energy slot where the locks are online, and the
night clerk's own room check and notes (the *Uten robot* input, built Sunday: stored on her device in
the pilot build, a server store is pilot work), and puts the rooms, the open items with owners and the
sign-off on the 06:00 handover. The robot is phase 2. The number that decides it: mornings signed (5 of
7, the conversion rule above), with the GM's yes; beside it, rooms ready before the housekeeping round
and the minutes from 06:00 to the first room sent to reception, against a week of their own logbook
before the pilot. The prize money (NOK 50,000) buys four weeks of one person's runway
and the first PMS listing work, not "two more pilots".

**The named security step before hotel 1 goes live (security review):** one account per person with
its own password, and sessions that can be revoked one by one instead of today's shared team password
and 12-hour tokens that only a new secret ends (`TODO(phase-3)`; `docs/checks/threat-model.md`,
*Residual risks*). Said on the slide, so the 48-hour shortcut reads as a decision, not an oversight.

**The first 100 users: the slide (marketing review).** Every number is either measured on Sunday morning
(§ 8.1, **PENDING** until the phone round runs) or labelled as an assumption. Counts, never
percentages from a handful of calls.

- **Who counts.** A **user** is a person who signs *Kvitter mottatt* on every shift they work (a
  per-shift rule, so the part-timers, about 40 % of the stable workforce, SSB, count too). A hotel is
  **active** when its 06:00 handover is signed in Fettero on **at least 5 of 7 mornings**. Both come
  from one append-only server event per sign-off (hotel, role, date; no guest data). Not built: today
  the sign-off is kept on one device, and the screen says so (`TODO(phase-3)`, PRD § 6).
- **100 users = H hotels × S signers per hotel.** S comes from § 8.1 Q5 (**PENDING**). The old
  assumption of about ten per hotel was probably high: S = 3 gives H = 34, S = 4 gives H = 25, S = 6
  gives H = 17.
- **Conversations needed = H ÷ (y × p),** where y is the share of conversations that take a free pilot
  (Sunday's Q2 tally, **PENDING**) and p the share of pilots that convert (**assumption: 1 in 2**). At
  the stop rule's floor, y = 2 in 10, and H = 25: 25 ÷ (0.2 × 0.5) = **250 conversations**; at y = 4
  in 10, 125. Two people at about 25 calls a week each (assumption) make 250 in five weeks.
- **Dates** (the stop rule is decided; the rest is a proposal, team to confirm): Mon 9 Nov, call back
  every yes and maybe with the printed page and `docs/DPA.md` · **Mon 16 Nov, hotel 1 live** (read-only,
  software only) · **Tue 8 Dec, the stop-rule check:** fewer than 2 pilots from the first 10 hotels we
  spoke to, and we stop the hotel wedge and test robot makers (counted on conversations held, above) · Mon 14 Dec, hotel 1's four weeks end, the conversion rule
  above decides · **10 hotels by the end of February 2027** (proposal).

| Order | Hotels | Users (at S = 4, assumption) | Channel | Gate |
|---|---|---|---|---|
| 1 | 1 | ≈ 4 | direct, from the Sunday phone round | one yes to a free pilot, the DPA signed |
| 2 | 2–3 | ≈ 12 | independents through VisBook, and one robot maker's existing hotel customer | hotel 1 meets the conversion rule |
| 3 | 4–10 | ≈ 40 | one independent group (7 of De Historiske's ~70 hotels) and a PMS marketplace listing | three pilots that converted |
| 4 | 11–25 | ≈ 100 | the marketplaces, and staff who move: a night manager who has signed the page takes it to her next hotel | 5 of 7 mornings signed at every active hotel |

No paid ads: the segment is too small for them. Two cheap channels to test, no more: a blank A4
*Overlevering 06:00* template (the print view with no data) as a lead magnet, since hotels search for a
*vaktbok* template, and the staff who move between hotels. The Monday e-mail to user number one
(Norwegian):

> *Emne: Natten deres, på én side.* Hei [navn], takk for praten søndag. Her er hvordan Fettero ville
> vist natten deres: hva som er åpent med eier og frist, hvilke rom som kan sendes til resepsjonen
> før husøkonomens runde, og hva som faktisk ble gjort. Vi tilbyr fire uker gratis, uten robot: vi
> leser PMS-en (bare lesing), ett signal per rom fra dørlåsen, aldri hvem, og nattevaktens egne
> notater. Vi måler hvor tidlig rommene blir klare. Databehandleravtalen ligger ved. Passer det med 20
> minutter denne uken?

## 8. Brukertest (Sunday 8 Nov, run by the team)

**Status: PENDING. No results yet. Nothing in this section may be quoted until a teammate has run it
and filled the tables with real answers.** It can't be faked, and a juror will ask for the raw notes.

### 8.1 Phone round: 10 Oslo hotel receptions, two windows

Who calls: **[fill]** (not the person running the Wybe final at 12:00). Pick 10 Oslo hotels of about
60–200 rooms from public listings, a mix of independent and chain, never two from one chain. **Two
windows (marketing and founders review):** the night desk **before 06:45**, when the person who writes the 06:00
handover is on shift and the hour is quiet (the user: Q1, Q3, Q3b, Q6, Q7); then the duty or front
office manager **08:00–09:30**, before the Sunday check-out peak (the buyer: Q2, Q4, Q5, and ask for a
written "yes, send me the pilot" by e-mail). A walk-in at a hotel near the venue at 06:30 with the
printed page ("Hvordan ser overleveringen deres ut?") beats a call; photograph only a blank form, never
a filled one. Don't write hotel or person names in the repo unless they agreed; never write phone
numbers.

Script (four questions, about three minutes; Q5 only if they have time):

1. *Opener:* "Hei, jeg heter [navn]. Vi er et lite team på Oslo Sprint-hackathonet som lager et verktøy
   for overleveringen kl. 06 på hotell. Har du tre minutter til fire korte spørsmål? Vi selger ingenting
   i dag."
2. **Q1:** "Hvordan gjør dere overleveringen fra nattevakt til morgenvakt i dag: papirbok, notater i
   PMS-en, e-post, Teams, eller noe annet?"
3. **Q2:** "Kunne dere tenkt dere å teste en skjerm for den overleveringen i fire uker, gratis?"
4. **Q3 (the counterfactual, founders review):** "Når finner dere i dag et rom som står opptatt, men der
   gjesten har reist: i nattrevisjonen, på husøkonomens runde (hvilket klokkeslett?), eller når neste
   gjest står i resepsjonen? Hvor mange i uka?" (what Fettero buys is hours: write the time and the
   number they say; a guest due out *today* doesn't count, the PMS already sells that room)
   **Q3b:** "Hvor mange netter i måneden er dere utsolgt?" (when an earlier room is real money)
5. **Q4:** "Hvis en skjerm fant de rommene før kl. 07, ville 30 kr per rom i måneden vært verdt det?"
   (the first price signal: yes / maybe / no, and why)
6. **Q5 (if time):** "Hvor mange ulike personer tar over vakten kl. 06 i løpet av en uke?" (S, the
   signers per hotel, in the first-100 arithmetic, § 7)
   **Q6 (if time, the message test, marketing review):** "Hvis du bare fikk se én ting kl. 06:00, hva ville det
   vært: (a) rom som kan selges, (b) hva som er åpent og hvem som eier det, eller (c) hva
   roboten eller nattevakten faktisk gjorde?" Write their exact words: the phrase used most becomes the
   hook line. And: "Hva tenker du når du hører navnet Fettero?"
   **Q7 (the lock, domain review):** "Hvilket låssystem har dere, og er låsene online, eller leses loggen av
   ved døra? Er energibryteren koblet til et system?" (whether the lock signal exists at night for this
   hotel, `docs/PRIVACY.md` § 10.1)
7. *Close:* "Får vi sitere svaret ditt uten navn i pitchen i dag, med hotelltype og omtrent antall
   rom? Og kan vi sende deg en e-post på mandag?"

| # | Time | Hotel type and size (no name unless agreed) | Reached? | Q1: how they hand over today | Q2: yes / maybe / no | Q3: when and how many a week | Q3b: sold-out nights a month | Q4: NOK 30 worth it? | Q5: people who sign | Q7: lock online? | Quote (with permission) | E-mail Monday? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | | |
| 2 | | | | | | | | | | | | |
| 3 | | | | | | | | | | | | |
| 4 | | | | | | | | | | | | |
| 5 | | | | | | | | | | | | |
| 6 | | | | | | | | | | | | |
| 7 | | | | | | | | | | | | |
| 8 | | | | | | | | | | | | |
| 9 | | | | | | | | | | | | |
| 10 | | | | | | | | | | | | |

Tally, to paste into § 3, § 6 and § 7: "Sun 8 Nov, [times]: 10 hotels called, __ reached; __ hand over
on paper, __ in the PMS, __ by e-mail or chat; __ yes, __ maybe to a free pilot; a sleeper found at
__ (night audit / housekeeping round at __:__ / next guest), __ a week; sold out __ nights a month;
NOK 30 a room a month: __ yes, __ maybe, __ no; locks online at __ of __; __ people sign a week."

**Also before 14:00, at the Wybe stand:** ask Wybe's team for one night of their robot's task log ("we
render it on Overlevering within 48 hours"), and whether Wybe would introduce one of its hotel
customers to a Fettero pilot. Write down the answers as given, yes or "not yet": **[fill]**. A partner conversation that happened beats a channel slide; one that didn't is not
mentioned.

### 8.2 Hallway test: 3 people, 5 minutes each

Who runs it: **[fill]** (a facilitator who reads the tasks and an observer with a stopwatch and this
table). Three people at the venue who are not on our team, ideally one who has worked in a hotel or a
reception; note their background, not their name. Laptop at 1440 px, logged in as `jury`, opened
where the login lands (**Overlevering**, since round 5), cold. Read each task word for word, ask them to think aloud, don't help, stop a task at 60
seconds.

| Task (read aloud) | Success looks like |
|---|---|
| T1 "Klokka er 06:00 og du tar over hotellet. Hvilke rom kan du selge i dag?" | Names 213 (to reception after the desk confirms) from Overlevering or Rom; bonus if they say 209 is held back and why |
| T2 "Hvilken sak fra roboten er fortsatt åpen, og hvordan tar du den?" | Taps *Ta saken* on the robot's open request |
| T3 "Gjorde roboten noe i natt som den sikkerhetsansvarlige bør vite om?" | Finds the stranger at seven doors (the open item, the bell or *Robotens vurderinger i natt*) |
| T4 "Kvitter for at du har tatt over vakten." | Taps *Kvitter mottatt* |

Measure per task: seconds to the first correct tap, success within 60 s (yes/no), wrong taps before
success, where they looked first, one thing they said. Afterwards ask: "Hva var mest forvirrende?"

Order matters (design review): **test first, then fix, then retest.** Run P1–P3 on the build as it is, change
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
