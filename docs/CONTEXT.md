# CONTEXT.md — The hackathon

> Everything about the event that shapes what we build. Every AI session reads this to weigh
> trade-offs, so the rules, scoring and deadlines here are exact. Sources: the three files in `docs/`
> (`Oslo Sprint – Kickoff.pptx` incl. speaker notes, `Wybe Night Shift – Arrangørguide_1.pdf`,
> `Hackathon - Holio og utfordringer fra lagerdriften.pdf`) and the organisers' Discord posts the
> team lead pasted on 2026-11-07 (§ 8). Read on 2026-11-07.

## 1. Event

| | |
|---|---|
| Name | **Oslo Sprint** — vibecoding hackathon. "One weekend. One MVP." |
| Dates | Fri 6 – Sun 8 November 2026 |
| Place | BI Startup Village, Nydalsveien 37, Oslo. Wi-Fi: `BI-Guest` |
| Open | Fri until 21:00 · Sat 09:00–23:30 · Sun from 09:00 |
| All info | Discord: https://discord.gg/yGu4xxftmB (schedule, rules, updates, digital mentors, ElevenLabs codes) |
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
| **Main prize** (Opera) | **NOK 50,000** | Jury | A finished product (app, website, game, tool…). "Doesn't have to be perfect, but it has to work well enough to show off the idea and its main features." |
| **Wybe Night Shift** | **NOK 10,000** | Server score only | Highest average score over the 10 final shifts, worst one dropped (§ 5). |
| **Holio** | **NOK 10,000** | Holio / jury | A solution to one of nine warehouse pains, shown for the people who work there (§ 6). |
| **ElevenLabs** | 6 months ElevenLabs Scale ($299/mo, $1,794) | ElevenLabs | "Best product built with ElevenLabs." Every participant gets a free Creator subscription (code on Discord). |

Holio's document leaves its judging criteria blank ("filled in by the organiser"). Ask Holio.

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

**What it is:** "A robot is working the night shift at Hotel Wybe. You are its brain." An AI agent
controls a hotel robot **in a simulation**, through an API. It is a robotics-and-AI challenge, but
the robot is simulated: the score comes from the server, not from the jury.

**Our access (team Fettero):** endpoint **`https://nightshift.wybe.me/`**, header
`Authorization: Bearer <key>`, key in `.env` as `WYBE_NIGHTSHIFT_KEY`. The protocol, found
2026-11-07: `POST` a JSON body `{"cmd":"<command>","args":{…}}`; replies look like
`{"ok":…,"clock":…,"result":…,"events":[…],"note":…}`. `{"cmd":"help"}` lists help, whoami,
start_shift, shifts, leaderboard. The full command map is in `docs/research/wybe-api.md`. Wybe's
message to the team: "Score as high as you can before Sunday 13:00. Anything goes, as long as it
talks to the endpoint."

**How it works**

1. The team joins through one link: **https://nightshift-board.wybe.me/join** ("no key needed", open
   the link and sign up). The organiser guide calls it "one key, one address. Nothing more."
2. **No documentation.** "How does the API work?" → "**Ask the robot.**" The agent has to find out
   which commands the robot understands.
3. The night manager sends tasks: **towels, lost items, room checks.** There are always more tasks
   than anyone can finish.
4. **Surprises along the way.** Good judgement earns points; careless actions cost points.
5. A laptop and internet are enough. ChatGPT, Claude and anything else are allowed. Teams pay for
   their own AI services.

**Scoring** ("right, fast and safe")

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
humanoid robot at the venue all weekend ("a robot employee from Moss").

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

**The task:** "Pick one of nine real challenges from warehouse operations and show a solution for
the people working there. No prior knowledge needed. The directions are just examples: how you
solve it is up to you. **Use test data only** (never real customer data)."

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

| Who | Role | Why it matters to us |
|---|---|---|
| The founder juror | Founder | Founder lens |
| **The Wybe juror** | Engineering lead, **Wybe Robotics** | Wybe challenge owner |
| **The Wybe engineer** | Engineer, **Wybe Robotics** | Wybe |
| **The Holio juror** | **Head of Holio** | Holio challenge owner |
| The security juror | Ethical hacker | Will probe security: keys, inputs |
| The data juror | Data engineer | Data and ML soundness |
| **The product juror** | AI product lead, **Opera** | Main-prize sponsor |
| The law juror | Lawyer | Privacy: cameras in a hotel, guests' voices (GDPR) |
| The marketing juror | Founder and lecturer | Marketing, story |
| The design juror | Digital designer | Design quality |
| **The creative juror** | Creative and product marketing, **Opera** | Main-prize sponsor |

Two Opera people are on the jury. Saturday 16–17 is the panel talk: our chance to ask Wybe and
Holio what they reward.

## 8. Original brief (verbatim)

> The team lead's words of 2026-11-07, kept so the full intent is available to every session.

> all right, good. The plan now is that we are making a project for the hackathon. The delivery
> time is tomorrow at 14 pm. The idea is wybe night shift, before you do anything, I want you to go
> through the files that I have attached now as context for the hackathon.
>
> We are building a machine learning algorithm where the robot can categorize products (for
> example, let's say food items, like soap, shampoo, etc.), as well as pick up old towels and do
> room checks. It can talk through Eleven Labs, and we can also talk to it. It can also translate if
> we have guests that are in a different language. If we talk to it, it can understand what we are
> saying and do the right command based off of that.
>
> What we need is an app to fit the robot. We need a machine learning algorithm for categorizing
> and camera-gjennkjenning, shortest route etc.
>
> Remember, this will be in a hotel with multiple levels, and we need to do a demo that we will
> show to the judges/juries at the end. For the brain, I want you to use, for example, the Claude
> API and then some algorithm for camera recognition where you can see what it sees. If you click
> on that, then it is possible to see the live feed and then boxes of categorization. For example,
> how people do with camera and trafic for categorization. If you need a backend, you can just use
> Cloudflare R2 if that is fine.
>
> […] there is a leaderboard, we need to be on the top […] the holio goal is 3,6,9 […]
>
> For scraping the internet, you can use the Scrapling tool: https://github.com/d4vinci/Scrapling
> I also have a bunch of GitHub repos that you might use: just look at my stars on my GitHub and
> download them if you want to.

**Organisers' Discord posts the team lead pasted (verbatim):**

> Wybe Night Shift: how the final works (Sunday) 🏁
> • 11:45: practice closes. Your agent should be done by then.
> • 12:00–13:00: the final. Start it with start_shift and mode: "final". Same API, same commands as in practice.
> • Every team plays the same 10 secret shifts, each in its own order. You get one try per shift and no restarts.
> • Start all 10 at 12:00. They can run in parallel. A shift is capped at 45 min, everything stops at 13:00, and a shift you never start scores 0.
> • 20 seconds per action. If your agent is slower, the robot stands idle and loses sim time. status and inbox don't reset the timer.
> • Ranking: the average of your 10 final shifts, with your worst one dropped. The practice leaderboard doesn't count.
> • 13:05: results revealed. NOK 10,000 to the winner.
>
> 📊 Leaderboard: https://nightshift-board.wybe.me/
> It updates every 10 seconds and shows your best practice shift. During the final it only shows progress (x/10 shifts per team). Scores stay hidden until the reveal at 13:05.

> Side challenge: Holio – make life easier in the warehouse
> Holio is the software that runs the warehouse behind online stores: incoming orders, stock on the shelves, packing, shipping labels and returns.
>
> The task
> Pick one of nine real challenges from warehouse operations and show a solution for the people working there. No prior knowledge needed.
>
> The nine challenges
> Missing dimensions – measure with the phone camera
> Manual delivery notes – read them from a photo
> No barcode – recognise items from a photo
> Wrong item in the box – camera check before sealing
> Wrong box size – suggest a box from the order
> Long walks – shorter picking routes
> Stock counts and shrinkage – find shelves with errors
> Assessing returns – guided, with photos
> Training – guidance in their own language
> The directions are just examples – how you solve it is up to you. Use test data only.
>
> Prize: NOK 10,000

**Decisions made after this brief (they override it where they differ), team lead 2026-11-07:**

1. Split into tracks: the Night Shift agent (leaderboard) and the app (main prize, Holio,
   ElevenLabs), built in parallel. Build with **subagent-driven development** as the standard for
   the whole repo, with as many subagents as help.
2. The Wybe key lives in `.env` (`WYBE_NIGHTSHIFT_KEY`).
3. Team name **Fettero**. Two members. Hamad builds the Night Shift agent (route finding, task
   planning); ShirazIQ builds the UI, the ElevenLabs connection and the demo (team lead, 12:25).
4. Private GitHub repo `haakram/oslo-sprint-26`.
5. Holio: pains 3, 6 and 9, all three equally, at demo level.
6. Claude API budget for the product: **USD 30** in total.

## 9. Team

| Name | GitHub | Role / focus | Owns (ARCHITECTURE § 3) |
|---|---|---|---|
| Hamad | haakram | Team lead, main coding | Track A: the Night Shift agent (routes, task planning) · tooling |
| ShirazIQ | ShirazIQ | UI, voice, demo | Track B: the app (UI, camera, ElevenLabs) · Track C: the demo |

- **Team name: Fettero.** Team photo due Sat 12:00.
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

Source: `docs/Oslo Sprint – Saturday morning.pptx` (slides and speaker notes).

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
