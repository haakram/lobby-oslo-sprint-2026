# CONTEXT.md — The hackathon

> Everything about the event that shapes what we build. Every AI session reads this to weigh
> trade-offs, so the rules, scoring and deadlines here are exact. Written from the organisers' kickoff
> slides, the Wybe and Holio challenge guides and the organisers' Discord posts, read on 2026-11-07.
>
> **Public copy:** the organisers' files and their verbatim text are not included here; the parts
> that shaped our work are summarised in our own words. Jurors are named by their field only.

## 1. Event

| | |
|---|---|
| Name | **Oslo Sprint** — a vibecoding hackathon: one weekend, one working MVP |
| Dates | Fri 6 – Sun 8 November 2026 |
| Place | BI Startup Village, Nydalsveien 37, Oslo. Wi-Fi: `BI-Guest` |
| Open | Fri until 21:00 · Sat 09:00–23:30 · Sun from 09:00 |
| All info | The event's Discord server (schedule, rules, updates, digital mentors, ElevenLabs codes) |
| Site | oslosprint.org |

## 2. Rules (strictly enforced)

1. Teams of **1–4**. No external people may help build.
2. **AI and all other tools are allowed.** Vibecode as much as you like.
3. **Existing code: not allowed.** (Our reading: no pre-built project or copied code. Libraries
   installed through a package manager are normal tooling. Starred GitHub repos are for inspiration
   and as tools, not code to paste in. Ask an organiser if in doubt.)
4. **No code before Saturday 09:00.** Friday evening was planning only.
5. **Deadline: Sunday 14:00.** Deliver the final product: **all files**.
6. Every team pitches **2 min + 1 min questions**.
7. A jury of developers, experts and founders picks finalists and winners.
8. Cheating, harassment or discrimination can get a team removed.

## 3. Prizes and how each is judged

| Prize | Amount | Decided by | What wins it |
|---|---|---|---|
| **Main prize** (Opera) | **NOK 50,000** | Jury | A finished product (app, website, game, tool…). It need not be perfect, but it must work well enough to show the idea and its main features. |
| **Wybe Night Shift** | **NOK 10,000** | Server score only | Highest average score over the 10 final shifts, worst one dropped (§ 5). |
| **Holio** | **NOK 10,000** | Holio / jury | A solution to one of nine warehouse pains, shown for the people who work there (§ 6). |
| **ElevenLabs** | 6 months ElevenLabs Scale ($299/mo, $1,794) | ElevenLabs | The best product built with ElevenLabs. Every participant gets a free Creator subscription (code on Discord). |

Holio's document left its judging criteria blank, to be filled in by the organiser. Ask Holio.

## 4. Timeline (Europe/Oslo)

| When | What |
|---|---|
| Fri 6 Nov 17:00 | Kickoff · 18:30 teams form · 19:00 planning (no code) · 21:00 venue closes |
| **Sat 7 Nov 09:00** | **Building starts** |
| Sat 12:00 | **Deadline: team photo and team name** |
| Sat 13:00 | Free Red Bull (16+) |
| Sat 14:00 | Opera demo of new products |
| **Sat 16:00–17:00** | **Jury panel talk**: ask the jury anything (Wybe, Holio and Opera people are there) |
| Sat 18:00 | Domino's pizza |
| Sat 23:30 | Venue closes |
| Sun 8 Nov 09:00 | Doors open, building continues |
| **Sun 11:45** | **Wybe practice closes**: our agent must be finished |
| **Sun 12:00–13:00** | **Wybe final**: start all 10 shifts at 12:00 |
| Sun 13:05 | Wybe results revealed |
| **Sun 14:00** | **Building deadline: deliver all files** |
| Sun 14:15–17:00 | Mini-pitch to the jury: 2 min + 1 min questions. The 10 best go to the final |
| Sun 17:00 | Finalists and side-challenge winners announced |
| Sun 18:00 | Pitching final: 5–10 min per finalist |
| Sun 21:00 | Prize awarding |

**Clash to plan for:** the Wybe final (12:00–13:00) runs during the last two hours before the
14:00 build deadline. The agent runs on its own, so the rest of the team can keep building, but
someone has to start and watch the 10 shifts.

## 5. Wybe Night Shift (side challenge, NOK 10,000)

**What it is:** a robot works the night shift at a hotel, and the team writes its brain. An AI agent
controls a hotel robot **in a simulation**, through an API. It is a robotics-and-AI challenge, but
the robot is simulated: the score comes from the server, not from the jury.

**Our access (team Lobby, registered at the event as “Fettero”):** endpoint **`https://nightshift.wybe.me/`**, header
`Authorization: Bearer <key>`, key in `.env` as `WYBE_NIGHTSHIFT_KEY`. The protocol, found
2026-11-07: `POST` a JSON body `{"cmd":"<command>","args":{…}}`; replies look like
`{"ok":…,"clock":…,"result":…,"events":[…],"note":…}`. `{"cmd":"help"}` lists help, whoami,
start_shift, shifts, leaderboard. The full command map is in `docs/research/wybe-api.md`. Wybe's
message to the teams, in short: score as high as you can before Sunday 13:00; any approach is fine as
long as it talks to the endpoint.

**How it works**

1. The team signs up through one link on Wybe's leaderboard site and gets one key and one
   address, nothing else.
2. **No documentation.** The way to learn the API is to ask the robot itself: the agent has to find
   out which commands the robot understands.
3. The night manager sends tasks: **towels, lost items, room checks.** There are always more tasks
   than anyone can finish.
4. **Surprises along the way.** Good judgement earns points; careless actions cost points.
5. A laptop and internet are enough. ChatGPT, Claude and anything else are allowed. Teams pay for
   their own AI services.

**Scoring** (right, fast and safe)

- **+** every task the robot actually completes. **Faster earns more.**
- **−** wrong deliveries, **claiming something is done when it isn't**, unsafe or careless choices.
- The server checks everything itself.
- Rank = **average of the 10 final shifts with the worst dropped.** Tie → best judgement.

**The final** (Sun 12:00–13:00; from the organisers' Discord post, § 8)

- Practice closes 11:45. Start the final with `start_shift` and `mode: "final"`. Same API and
  commands as in practice.
- Every team plays the same **10 secret shifts**, each in its own order. **One try per shift, no
  restarts.**
- **Start all 10 at 12:00.** They can run **in parallel.** A shift is capped at **45 min**;
  everything stops at 13:00; a shift never started scores **0**.
- **20 seconds per action.** If the agent is slower, the robot stands idle and loses sim time.
  `status` and `inbox` **don't reset** that timer.
- The practice leaderboard doesn't count. The leaderboard (https://nightshift-board.wybe.me/)
  refreshes every 10 s and shows each team's best practice shift; during the final it shows only
  progress (x/10).

**Team rules:** one team, one key, don't share it. In the final the agent runs **on its own, no
hand-steering.** Don't attack or overload the server. Everything else is allowed; everything is
logged, and breaking a rule can disqualify. Server problems go to Wybe's stand.

**Contact:** Wybe's challenge owner, at the Wybe stand. Wybe also has a physical
humanoid robot at the venue all weekend.

**What this means for us:** only the agent's autonomous play scores here. A camera feed, voice or
a dashboard earns no Wybe points (they can earn points for the main prize, Holio and ElevenLabs).
To be on top: discover the command set early in practice, never claim false "done", be fast
(well under 20 s per action), and run 10 shifts in parallel without hitting API rate limits.

## 6. Holio (side challenge, NOK 10,000)

**Holio** is the software that runs the warehouse behind online stores: incoming orders, stock on
the shelves, packing, shipping labels and returns. Three parts: **Holio Ops** (the mobile app
warehouse staff use all day on Zebra TC27 handheld scanners and iPhones; React + TypeScript wrapped
with Capacitor), **Holio on PC** (managers and customer service follow orders, stock and
deviations), and **integrations** (orders pulled automatically from e.g. Shopify; a customer portal
per web shop). Behind it sits a WMS that tracks every item, shelf location and order.

The flow an item takes: **receiving → storage → picking → packing → shipping → returns.**

**The task, in short:** pick one of nine real warehouse problems and show a solution for the people
who work there. No prior knowledge is needed, the suggested directions are only examples, and
**only test data** may be used (never real customer data).

| # | Pain | The problem | Suggested direction |
|---|---|---|---|
| 1 | Missing dimensions | Measuring with a tape is skipped, so shipping prices (volumetric weight), box choice and shelf capacity are wrong | Measure L×W×H with the phone camera at receiving and packing |
| 2 | Manual delivery notes | Paper/PDF delivery notes are checked against the purchase order line by line; discrepancies found too late | Read the note from a photo and show deviations at once |
| **3** | **No barcode** | No barcode, an unknown one, or a torn label: staff search manually and pick the wrong item | **Recognise the product from a photo or the text on the packaging** |
| 4 | Wrong item in the box | Wrong colour/size or two instead of one slips past scanning | Quick camera check before the box is sealed |
| 5 | Wrong box size | Box chosen by eye: too big wastes filler and freight, too small means repacking | Suggest a box from the items in the order |
| **6** | **Long walks** | Bestsellers sit far from the packing table and the route isn't the shortest; pickers walk kilometres a day | **Better item placement or a shorter route from the order history** |
| 7 | Stock counts and shrinkage | System counts drift from the shelves; full counts take long; errors found when an order can't be picked | Find shelves most likely to be wrong, or count shelves from photos |
| 8 | Assessing returns | Resellable or damaged? Slow, and staff judge differently | Guided assessment with photos that suggests what to do |
| **9** | **Training** | Many new temporary staff at Black Friday and Christmas; most mistakes happen in the first days | **Guidance right in the app, in the worker's own language** |

**Our goal (team lead, 2026-11-07): pains 3, 6 and 9, all three equally, at demo level** ("just a
demo so we can show that it works"). Note: Holio's text says "pick one". Whether three in one flow
counts for or against us is an open question to ask Holio.

Holio's document leaves blank: demo time, Holio contact, equipment on loan (e.g. a Zebra TC27),
test data, judging criteria. **Ask the Holio juror (Head of Holio, on the jury) or the Holio
stand.**

Glossary: WMS (warehouse management system) · varemottak (receiving) · innkjøpsordre (purchase
order) · følgeseddel (delivery note) · plukk (picking) · varetelling (stock count) · svinn
(shrinkage) · fraktetikett (shipping label) · transportør (carrier, e.g. Bring, PostNord) ·
volumvekt (volumetric weight) · SKU / EAN (item number / barcode).

## 7. Jury

Eleven jurors, named here by field only: founders, the Wybe challenge owners (two Wybe Robotics
engineers), the Holio lead, IT security (an ethical hacker who would probe keys and inputs), data and
ML, AI product and creative marketing (two people from Opera, the main-prize sponsor), law (privacy:
cameras in a hotel, guests' voices, GDPR), marketing and story, and design.

Saturday 16–17 is the panel talk: our chance to ask Wybe and Holio what they reward.

## 8. The brief, summarised

**The team lead's opening brief to the AI (2026-11-07), in short:** build for the Wybe Night Shift
challenge, deliver by Sunday 14:00, and read the event files first. The robot should recognise and
sort hotel products (soap, shampoo, food), collect used towels and check rooms; speak and listen
through ElevenLabs, translate for guests who speak another language, and turn what staff say into
the right command. Around it: an app with camera recognition (a live feed with boxes around what the
robot sees), shortest routes across a hotel with several floors, the Claude API as the brain, and a
demo for the jury. Aim for the top of the Wybe leaderboard; for Holio, pains 3, 6 and 9. Scrapling
and the team lead's starred GitHub repos were offered as tools.

**The organisers' Discord posts, in short:** the Wybe final post repeats the rules in § 5 (practice
closes 11:45; the final runs 12:00–13:00 with `mode: "final"`; ten secret shifts, one try each, run
in parallel, 45 minutes at most; 20 seconds per action; rank by the average with the worst shift
dropped; scores hidden until 13:05). The Holio post lists the nine warehouse problems in § 6, says the
directions are only examples and that only test data may be used, and names the NOK 10,000 prize.

**Decisions made after this brief (they override it where they differ), team lead 2026-11-07:**

1. Split into tracks: the Night Shift agent (leaderboard) and the app (main prize, Holio,
   ElevenLabs), built in parallel. Build with **subagent-driven development** as the standard for
   the whole repo, with as many subagents as help.
2. The Wybe key lives in `.env` (`WYBE_NIGHTSHIFT_KEY`).
3. Team name **Lobby** (registered at the event as “Fettero”). Two members. Hamad builds the Night Shift agent (route finding, task
   planning); ShirazIQ builds the UI, the ElevenLabs connection and the demo (team lead, 12:25).
4. Private GitHub repo `haakram/oslo-sprint-26`.
5. Holio: pains 3, 6 and 9, all three equally, at demo level.
6. Claude API budget for the product: **USD 30** in total.

## 9. Team

| Name | GitHub | Role / focus | Owns (ARCHITECTURE § 3) |
|---|---|---|---|
| Hamad | haakram | Team lead, main coding | Track A: the Night Shift agent (routes, task planning) · tooling |
| ShirazIQ | ShirazIQ | UI, voice, demo | Track B: the app (UI, camera, ElevenLabs) · Track C: the demo |

- **Team name: Lobby** (registered at the event as “Fettero”, which is the name on the Wybe leaderboard and on Discord). Team photo due Sat 12:00.
- Where we talk: TBD
- Where the shared secrets live: Hamad's `.env` / `.env.local`, sent privately with
  `scripts/secrets.sh` (OPERATIONS § 4). Never in a channel, the repo or a screenshot.

## 10. Resources and constraints

- Claude API for the brain (team lead's choice). **Budget: USD 30 in total for the product**
  (`ANTHROPIC_BUDGET_USD`, AI_RULES R7.7). The Wybe final alone is up to 10 shifts × 45 min with an
  action every ≤ 20 s (up to ~1,350 decisions), so routine moves are plain code and Claude is called
  only where judgement is needed. Claude Code subagents run on each person's own plan and aren't
  part of this budget.
- ElevenLabs: free Creator subscription for every participant (code on Discord).
- Cloudflare R2 suggested by the team lead if a backend is needed. (R2 is file storage only; a
  server would be Cloudflare Workers or similar.)
- Scraping: Scrapling (https://github.com/D4Vinci/Scrapling), available as a Claude Code skill.
- Team lead's GitHub stars (112 repos) as tools and inspiration. Rule 3 forbids pasting existing
  code into the product.
- GitHub account is on the free plan: a private repo can't have branch protection.

## 11. How we're judged and how to submit (Saturday-morning deck, read 2026-11-07)

Source: the organisers' Saturday-morning slides and speaker notes (not included in this copy).

**Submit (deadline Sun 14:00, code freeze):** one GitHub repo for the team; **the jury looks at the
commit history** (code committed before kickoff counts against you); type `/lever` in #general
(team + repo; demo link and description optional); `/min-innlevering` shows what's submitted;
`/lever` again to update. At 14:00 every repo is locked at its latest commit. *No submission, no
demo, no prize.* **Our repo is private: the jury must be able to open it — make it public or give
the jury access before 14:00 (team lead's decision).** The agent code must be on `main`.

**Open round (14:15–17:00):** 2 min demo + 1 min questions; each juror weighs the whole product with
a focus on their field; **top 5 per panel go to the final.** Scored 1–10 on:

| Criterion | + Looks for | − Pulls down |
|---|---|---|
| Functionality | Live demo, the core flow works | Only slides, hard-coded answers |
| A real problem | Clear target group, a real need | A solution looking for a problem |
| Innovation | A new angle, smart use of tech | A copy, or a thin chatbot shell |
| Design | Understandable without explaining | Messy, needs explaining |
| Team efficiency | A lot done, well prioritised in 48 h | Too big a scope, little works |

**Final (18:00, top 10):** 5–10 min pitch + questions; each juror judges from their own field only;
highest total wins. Founders: *can this become a company? next step if you win tonight?* · IT and
security: *robustness, security, scaling, data; biggest technical risk?* · Product: *the right core
flow and cuts; what did you leave out, and why?* · Marketing: *audience, message, channels; first 100
users?* · Creative and design: *intuitive flow, coherent look; tested with users?* · Law: *privacy,
rights, regulation; legal hurdles?* · Domain experts: *does it match the industry; why hasn't anyone
solved this?* **The jury judges the product, not the speaker.**

Scale: 9–10 exceptional (works and stands out) · 7–8 strong (solid, one clear weakness) · 5–6 good
(promising, not convincing) · 3–4 weak (much missing) · 1–2 very weak.
