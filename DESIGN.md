# Design system: Fettero

> Every screen reuses these values; components never hard-code a colour, font or size that isn't
> here. Changing a token is a team decision (it changes every screen). The tokens live in
> `src/app/globals.css` (CSS variables + Tailwind `@theme`); Tailwind's own colour and radius
> palettes are switched off there, so only these names exist.

Character: **a calm, precise operations tool for a hotel you trust at 06:00.** Fettero is one place to
see and run the whole hotel, with AI: a robot that works the night, a receptionist that answers the
phone, and the rooms, guests, requests, work orders, stores and shifts around them. Industrial, not
playful: concrete and white paper for the working screens, night steel for the robot's world, one
safety-orange accent for the one action on a screen. The person holding it is working, often new,
sometimes in gloves.

(Team lead 2026-11-07 21:30: the "night desk" redesign of the evening is retired; this is the look the
code has. Everything below is read from `globals.css`, `layout.tsx` and `src/ui/`.)

## Name and line

One name, one line, the same everywhere a person reads them (jury round 1 counted three names and four
taglines). The words live in `src/ui/brand.ts`; the rail, the phone's top bar, the login page, every
page title (`Rom og renhold | Fettero`) and the meta description read them from there.

- **Name: Fettero.** The product, the app and its AI ("Fettero foreslår å si ja", "Snakk med Fettero").
  *Lobby* was the working name until 2026-11-08; it is retired in everything people read, because a funded
  Zurich hotel-AI company already trades as Lobby on the same PMS channel (Apaleo). Code identifiers keep
  the old name (`LOBBY_USERS`, `lobby:` storage keys, `scripts/lobby-hash.mjs`); renaming them buys nothing
  on screen. The team lead decides whether `main` follows this branch.
- **The line: *Natten, ærlig overlevert.*** In English: *The night, handed over honestly.* It names the
  differentiator: the morning gets the night as it was, every "done" confirmed by the server. Login lede,
  meta description, README top, first slide and last spoken line; nowhere a second tagline.
- **What it is, in one sentence:** *Morgenvakten på hotellet får natten på én side kl. 06:00: rom som kan
  selges, det som er åpent med eier og frist, og hva som faktisk ble gjort, fra nattevaktens notater og
  eventuelt en robot.* Goes after the line (login, meta description, link preview, app manifest). It sells
  without a robot (jury round 3, the marketing juror): the handover is the product, the robot one source beside the night
  staff's own notes. "kl. 06:00" never breaks.
- **The hotel is *Hotell Nattskift*:** only the demo hotel's name, under the product's name in the rail and
  in Oversikt's top bar. The host sees *Korttidsutleie i Oslo* there instead.
- **The robot is *roboten*,** lower case, in running text ("Roboten fullførte 73 av 77 oppdrag"). It is
  not called Fettero: Fettero is the product the robot works for.
- The name is set in Schibsted Grotesk 700, tight (−0.02 em in the rail, −0.03 em on login); no logo mark,
  no orange in the name (orange is the one action and the robot).
- **The icon is the name's F:** Schibsted Grotesk 700's F (its stem and arms read from the font, on whole
  pixels at 16, 32 and 48) in night steel's ink `#e8edf0` on night steel `#121c24`, 6 px corners on the
  32 px grid: `src/app/favicon.ico`, `icon.svg`, `apple-icon.png`, and `public/icon-192/512.png` plus a
  maskable 512 for the manifest (`src/app/manifest.ts`). A shared link previews with
  `src/app/opengraph-image.png` (1200×630, the name, the line, the handover's three promises and *Kvitter
  mottatt*, no figures from a night). The proxy serves these brand files without a session.

## Character, one decision per axis

- **Type: one grotesk, one mono.** *Schibsted Grotesk* for everything you read, titles included;
  *Martian Mono* for every figure and identifier: the shift clock, the eight numbers on Oversikt,
  room numbers on tiles, request ids, counts. No display face; weight and tracking carry the
  hierarchy.
- **Colour: two neutral surfaces, one accent.** Light (concrete `#e9ecee`, white panels) is the
  default for the working screens; dark (night steel `#121c24`) is the navigation, the top bar of
  Oversikt, the login page, the 3D hotel, the camera and the night shift. The accent is orange and
  appears in two roles: the one primary action on a screen, and the robot (in 3D, on the plans, in
  its chip). Status green, amber and red mean state only, and a word always says the state too.
  **Good news is green or neutral; red and amber are for what needs a person** (team lead
  2026-11-08), which lives in the bell (see "Color · Where colour goes").
- **Space: dense inside, clear between.** 4 px grid; 4–8 px inside a group, 24 px between groups,
  24–32 px between sections. Page gutters 16 (phone) · 24 (tablet) · 40 (desktop); content up to
  1600 px wide. At 1280 px and up a screen is composed across the canvas (figures on one rule,
  two or three columns of panels), never a narrow column.
- **Finish: flat planes with a hairline.** A panel is `surface` with a 1 px `line` border and no
  shadow; wells and hover are `sunken`. Radii by size: 6 px controls and tiles, 10 px buttons and
  skeletons, 16 px panels and sheets.
- **One screen, one job.** Every module screen has the same frame (`ModulePage`): its name, one line
  on what it is, the screen's actions, four figures on one rule, then the panels. Oversikt is the
  exception: it is the whole hotel, one widget per module.
- **No hero.** Oversikt starts with a 64 px dark bar (hotel, night, robot chip, shift clock) and a
  greeting; every other screen with a `PageHeader`. The ambient fog (Vanta) lives behind the login
  page only.

## World

- **Nouns:** rom, etasje, korridor, heis, robot, oppgave, arbeidsordre, forespørsel, gjest, booking,
  ankomst, avreise, samtale, renhold, renholder, romservice, klar, må vaskes, opptatt, ikke forstyrr,
  ikke sjekket, avvik, ute av drift, vakt, lager, lin, vare, plukkliste, rute, stopp.
- **Surfaces:** light (`:root`, also `data-surface="light"`) for the working screens; dark
  (`data-surface="dark"`) for the navigation, the top bar, login, 3D-kart, Øyne and Natteskift. A
  subtree switches surface with the attribute; every token flips with it.
- **Roles** (`src/features/auth/roles.ts`, built from the module registry): admin sees everything
  and can view as another role; resepsjonist and robotansvarlig see only their modules, on Oversikt
  and in the navigation. The server enforces it (`src/proxy.ts`); the navigation only hides. The
  vert (an Airbnb host with 2–5 short-let apartments) has its own app under `/vert`, lands there, sees
  none of the hotel, and is not in the admin's view switcher.

## Modules

One registry, `src/features/modules/registry.ts`, lists the hotel's modules. The navigation
(`src/ui/nav.ts`), the route table (`roles.ts`) and the widgets on Oversikt
(`src/features/dashboard/widgets.tsx`) all read it; adding a module is one entry there, a page under
`src/app/<route>/` and a screen under `src/features/<domain>/`.

| Module | Route | Group | Who (besides admin) | Data | On the screen |
|---|---|---|---|---|---|
| Oversikt | `/` | Hotellet | both | mixed | The whole hotel, good news first: greeting, six figures, one widget per module; what needs a person is in the bell |
| Rom og renhold | `/rom` | Hotellet | both | run log + test | The key rack (every room's status), today's round per cleaner, rooms out of order; *Lag renholdsrute* Above the rack: the robot's room checks against the booking system (rooms to sell today, guests without a booking; *Bekreft med resepsjonen* (who, three ticks) then *Send til resepsjonen* (*Venter på PMS-en*), *Lag oppgave for resepsjonen*), the key rack (every room's status), today's round per cleaner, rooms out of order; *Lag renholdsrute* |
| Gjester og bookinger | `/gjester` | Hotellet | resepsjonist | test + reception | Arrivals, departures, in house tonight, the receptionist's bookings and callbacks, special cases |
| Ruter | `/ruter` | Hotellet | both | run log | Shortest route between floors: cleaning round, pick list, the robot's own walk |
| Overlevering 06:00 | `/overlevering` | Drift | resepsjonist | run log + staff log + door lock + reception + Øyne + test | The night on one page for the morning manager, read act → evidence → sign. Under the night line *Natten fra · Med robot / Uten robot* (`SourceSwitch`; *Uten robot* is the same page from the booking system, the door lock's one signal per room and the night clerk's entries; *Med robot* adds the robot to all of that and never drops one of her entries, round 6). One quiet demo band (`sunken`, `info-circle`: the night's source, bookings and lock are test data, "Det du gjør her, lagres på denne enheten"); the lists carry no source notes of their own, and there is no summary line above the figures. Four decision figures, each a link with a down arrow to its row: *Holdt tilbake fra salg* as the room itself ("209") with the robot's own contradiction drawn as two points, 16 px in ink (`● 01:29 bagasje inn`, `● 03:47 meldt tomt`, the second dot `warning`); the money led by the certain cost, *Rom 210 i bruk uten booking · ca. kr* ("En natt ingen fakturerer · kan selges igjen i dag"), with the room found free as its own link under it (*Rom 213: funnet ledig 5 timer tidligere*, then *sendt til resepsjonen · venter på PMS-en*) and *Slik regner vi*; *Sikkerhet, straks* counting each hazard ("4 våte gulv · 1 ukjent person · 4 ikke varslet", live with the taps); the robot's figure with *Slik vet vi det* ("bekreftet av simulatoren"). *Åpent nå* in the wide column, its count the same saker the safety figure and the receipt count (each wet floor one), the note "5 straks · 8 med frist i dag". Safety first: the wet floors one row with a scan line each ("Korridor 2B siden 23:51 · roboten skled · 6 t 9 min uten at noen ble varslet"; the clerk's own floor "Lobbyen · meldt 02:15 av Kjersti Lund · skilt satt ut 02:16"; her Kvitter on /natt reads "Kjersti Lund kvitterte kl. 23:53, etter 2 min"), the stranger, her doors; each with *Varsle Trond Eikeland* / *Varsle resepsjonen* (secondary small, `bell`), which records "Varslet … · Siri Haugen · nå · registrert her, ingen SMS ennå" with *Angre* (`lobby:handover-varslet`, 30 days). Then everything by deadline, owners as roles with who is on. A row shows its facts as marks, not prose (`lead`): room rows carry source chips (`[Dørlåsen · …] [Nattevakt · …] [Roboten · …]`, the robot's in night steel, ink on paper) and the verdict with a `success` check ("Bekreftet av tre kilder"; one source: "Én kilde: sjekk rommet"); 209 its two points and "Resepsjonen avgjør" (never "dobbelt tildelt?"); the catch a neutral *Holdt tilbake* badge with the shield. The sale in two steps inline, the page's one orange action while a room waits: *Bekreft med resepsjonen* (who, an empty field with reception's names as suggestions; three ticks; the reason beside the button) then *Send til resepsjonen*; the row then says *Venter på PMS-en* once. Øyne's *Ingen av disse* is a row by its deadline. The night clerk's note beside the work from 1280 px; the robot's judgement card; *Kvitter mottatt* last, orange once no room waits, with one calm line while a safety sak was told to nobody ("4 sikkerhetssaker er ikke varslet til noen. Du kan kvittere likevel."), and the receipt says it ("med 13 åpne saker, 1 sikkerhetssak ikke varslet"; 30 days on this device). Prints one A4 leave-behind: masthead, the band's test-data sentence, the figures, the open list with owners beside it, the note, a signature line; the footer says "Inneholder personopplysninger. Makuleres etter vakten." on a real night and "Testdata: ingen ekte gjester." on test data |
| Nattevaktens logg | `/natt` | Drift | resepsjonist | local + test | The night clerk's own input, phone first (jury round 5: a hotel with no robot still gets its handover). *Fra roboten* first (round 6; hidden when the night has no robot log): the robot's hazards (the handover's bare wet floors and the person at the doors) at the robot's clock in Martian Mono, newest first, each with a secondary *Kvitter* (who and when, an `acknowledged` line; the row then folds to "Kvittert av … · kl. 23:53" with *Angre*), one `danger` badge "N ikke kvittert" in the head, never a red row. *Sjekk disse først*: where the door lock's one signal per room and the booking system disagree (a booked room with no card, a card in a free room), each with *Sjekk rom N*; *Rom*: a floor switch and the rooms as 56 px tiles (a dashed edge and "sjekk" on a flagged one, the logged word on a logged one), then the chosen room with its booking line (the guest's name and the lock's line only on a flagged room; elsewhere "Systemet: booket til 9.11" and "bank på og vent"; the lock never gives a time) and three equal choices (*Tom og ryddig*, *Ikke tom*, *Trenger vask*; none is orange: the risky answer is never the loud one) and "«Tom og ryddig» selger ikke rommet"; *Noe som kan skade en gjest* (Vått gulv · Dør · Person, *Hvor*, for a wet floor the required *Skilt satt ut?* with two equal answers *Ja* / *Nei*, an optional line, *Meld fra til morgenvakten*, the screen's one primary); *Notat til morgenvakten* (280 characters); *Logget i natt*, newest first, each with *Angre* (adds a line; a taken-back entry stays, struck through); a wet floor without a sign says "uten skilt siden …" and offers *Skilt satt ut*. Every entry is the robot's own run-log line with `source: "staff"` and her name; kept on the device for 30 days (`RETENTION_DAYS`, pruned on load), "Lagres på denne enheten i 30 dager" on the screen |
| Forespørsler | `/foresporsler` | Drift | both | run log + reception + test | Every guest request from phone, robot, staff and voice. What the robot handed back first and pinned (calls that arrive later can't push it down), then the phone's calls in their own group (its place held while they load), then the rest; `?filter=robot` opens on the robot's. A call the AI receptionist took that names a room is a task (*Telefon (AI)*, *Se samtalen*, one tap: *Send roboten* / *Gi til …*); a room the hotel doesn't have is *Ukjent rom*, for reception. Each refusal is a decision (*Gi det likevel*), with the referee's verdict. A tapped row stays put with its *Angre*; actions are stamped "Siri Haugen tok saken · nå", never a clock |
| Vedlikehold | `/vedlikehold` | Drift | robotansvarlig | run log + test | Work orders by priority: the robot's findings and what staff reported; *Tildel*, *Marker løst* |
| Lager og lin | `/lager` | Drift | robotansvarlig | test | Linen and amenities per store room against what the rooms need; *Lag påfyllingsliste* |
| Ansatte og vakter | `/ansatte` | Drift | resepsjonist | test | Who is on which shift today, what they cover, who is off |
| 3D-kart | `/hotell` | Roboten | robotansvarlig | run log | The hotel in three.js, floors stacked, the robot walking its night |
| Natteskift | `/natteskift` | Roboten | robotansvarlig | run log | The robot's night step by step |
| Robotens øyne | `/oyne` | Roboten | robotansvarlig | — | Live camera with boxes, products recognised without a barcode |
| Snakk gjennom roboten | `/stemme` | Roboten | robotansvarlig | — | Voice: the robot translates between staff and guest |
| Resepsjon | `/resepsjon` | Resepsjon | resepsjonist | reception | The AI receptionist's calls, bookings and messages |
| Mine boliger | `/vert` | Utleie | vert (only) | test | The Airbnb host's start page: the month's good numbers, each apartment's status, today's turnovers step by step, newest messages, what the automation did |
| Gjestemeldinger | `/vert/meldinger` | Utleie | vert (only) | test | Guest messages in Norwegian (original a tap away), the auto-replies sent, the one that needs the host on top |
| Bookinger og inntekt | `/vert/bookinger` | Utleie | vert (only) | test | The next 14 nights per apartment, arrivals with payout, the month per apartment |
| Forsyninger og vedlikehold | `/vert/drift` | Utleie | vert (only) | test | Towels, paper, coffee per apartment against par; maintenance; *Bestill påfyll* |

Test data is marked twice: `TODO(phase-3)` in the data file, and a `SourceNote` line under every list
that shows it ("Testdata til integrasjonen er på plass."), so nobody on the projector takes it for the
hotel's real numbers. Run-log data says "Fra robotens natt (kjøringsloggen)."; the receptionist's "Fra
AI-resepsjonisten."

### Navigation groups

The rail and the Meny sheet show the modules in labelled groups, in registry order (`groupsFor` in
`src/ui/nav.ts`); a role sees only the modules it may open, and a group with nothing left in it is dropped.
Two cuts keep the demo rail short (jury round 1: 18 entries was too many): the admin's rail is the hotel's
(Utleie is not in it; the user plate's menu links to it under *Andre visninger* · *Utleie for verter*, and
the group shows while an admin is on one of its screens), and a screen whose service the server lacks is
left out for every role (`needs` in the registry: *Snakk gjennom roboten* without `ELEVENLABS_AGENT_ID`;
opened by its address, the screen says what is missing). Entries per role, without the voice agent:
admin 14 (was 18; 13 before the night clerk's log), robotansvarlig 9 (was 10), resepsjonist 9, vert 4.

**The admin's menu is the pilot** (jury round 3, the product juror: 13 modules in the sidebar for a four-screen pilot).
The admin accounts (`siri`, `jury`, `admin`) see Oversikt on its own at the top (the start page, no label),
then **Piloten**: Overlevering 06:00 · Nattevaktens logg · Rom og renhold · Forespørsler · Natteskift
(`PILOT_MODULES` in the registry, in that order; the night clerk's log, round 5, sits right after the
handover it feeds). Every other hotel screen sits in one folded group, **Utenfor piloten**, in
registry order: a disclosure button with the label, the count in Martian Mono and a chevron
(`aria-expanded`, named "Utenfor piloten, 8 skjermer"); open, it says *Bygget, men ikke med i piloten.*
and lists them. It opens by itself while one of its screens is on (the current screen is never hidden) and
otherwise stays as the person left it. The host's group, on a host screen, comes before it. Only the menu
changes: the admin may still open everything, and an admin viewing as another role gets that role's menu.
The other roles' groups below are unchanged.

Groups for the desk and the robot manager (and the registry's order):

- **Hotellet:** Oversikt · Rom og renhold · Gjester og bookinger · Ruter
- **Drift:** Overlevering 06:00 · Forespørsler · Vedlikehold · Lager og lin · Ansatte og vakter
- **Roboten:** 3D-kart · Natteskift · Robotens øyne · Snakk gjennom roboten
- **Resepsjon:** Resepsjon
- **Utleie** (the host only): Mine boliger · Gjestemeldinger · Bookinger og inntekt · Forsyninger og vedlikehold.
  Every host screen opens with a 64 px dark bar (the host, the date, the clock, the *Varsler* bell). What
  needs the host sits in the bell; amber and red appear only there, on the items that need action.

The bell (`NotificationBell`) is part of the navigation, so it is on every hotel page for every hotel
role: at the top of the rail beside the name on desktop, and on a phone in a slim dark top bar (*Fettero*,
the hotel, the bell) above the page. The host's screens carry their own bell in their top bar, so the
hotel's bell is never shown to the host, nor on /vert to an admin: one bell per screen. For the host the
slim bar reads *Fettero* and *Korttidsutleie i Oslo*, and the name links to /vert. On Oversikt that bar runs straight into the dark top bar, so the
phone reads one dark header.

The phone bar holds the role's first four *pinned* modules (Oversikt, Rom, then Gjester / Forespørsler
/ Vedlikehold by role; the admin's bar is Oversikt, Overlevering, Rom, Forespørsler, so the 06:00 handover is one
tap away) and *Meny*; everything else is in the sheet, each with its one-line hint (the admin's sheet: Oversikt,
Piloten, then *Utenfor piloten* folded, as in the rail). Short
names (`short` in the registry: Rom, Gjester, Lager, Vakter, Øyne, Stemme) go under the icons.

### Oversikt, the whole hotel, good news first

Team lead 2026-11-08: the first thing on Oversikt is how well the hotel runs, not a list of errors.
What needs a person moved into the bell.

1. **TopBar** (dark, 64 px): hotel name (from `lg`; the phone's top bar names it), the night ("Natt
   til søndag 8. november · overlevering 06:00"), the robot's chip (place · doing · battery, in the
   bar's grey even when low), the *Opptak* / *Direkte* badge, the shift clock in Martian Mono.
2. **Greeting** (`Greeting`, the h1): "God morgen / God dag / God kveld / Hei, Siri" by the shift
   clock of the night on screen (the recorded night ends at 06:00, so "God morgen" at any wall-clock
   hour; the Oslo hour only before a night is in; a shared login greets its desk: "God dag,
   resepsjonen"), then one factual line, not a verdict (jury round 2: no "Natten gikk fint." beside
   unsigned wet floors): what is done in `success` with a check ("73 oppgaver bekreftet"), what needs
   a person in plain ink ("· 3 våte gulv og 1 ukjent person trenger en eier."), then what the night
   staff did and what the day starts with ("Før innsjekk skal ett rom vaskes."). On the right the
   screen's one primary action: *Se overleveringen 06:00* (the product's front door, for every role
   that may open Overlevering; first on a phone), with *Lag renholdsrute* beside it as a secondary
   button when rooms must be cleaned (primary for a role without Overlevering), else *Lag sjekkrunde
   for N rom* (secondary).
3. **Hotellet i tall** (`KpiStrip`, figures from `highlights.ts`): six figures at most on one rule,
   `Stat size="lg"`, `success` where the figure is good, neutral otherwise, never amber or red. In
   order, filtered by what the role may open: nye bookinger i dag, belegg i natt (%), oppgaver
   fullført i natt ("71 av 81": the misses are part of the total, not a red count; one line, "Alle 73
   «ferdig» bekreftet · 4 til en person", the referee behind *Slik vet vi det*), rom klare til salg
   ("1 av 36": ready, and free in the booking system or released today; the same figure Rom and
   Gjester show, from `rooms/money.ts`, with the money line under it), rom sjekket av roboten; the
   robot manager gets varer over minimum instead of the guest figures. No estimate and no test-data
   rating (jury round 3: *Timer spart* and *Gjester fornøyd* were vanity figures on screen one).
4. **Widgets**, one per module the role may open, in registry order, in a 1 / 2 / 3 column grid (Rom
   spans two). A widget is a `Card` with the module's name, the *Åpne* link, its good news first (a
   green check and the figure: "73 av 87 fullført", "5 løst i dag", "15 av 16 varer over minimum"),
   then a dense list of at most four rows, completed first (*Sist fullført*, *Sist løst*), and its
   `SourceNote`. Ready rooms are green tiles; a room the room check held back is a taken tile
   ("Holdt tilbake"), never green, and so is one the booking system still holds until a person
   released it ("Bekreft først"), so the legend's Klar is the Klare til salg beside it; an avvik is a
   quiet mark. Rom's widget opens with the money line
   ("1 rom kan selges etter bekreftelse · ca. 1 500 kr · 1 holdt tilbake", *Se romsjekken*). The robot is one small
   widget (place, doing, battery, "68 av 78 oppgaver fullført", *Vis i 3D-kartet*), not the 3D hotel.

### The bell (`NotificationBell`)

Everything that needs a person, from every module the role may open (`selectAlerts`), in one place
on every page. Only what is actionable, safety first: each wet floor without a sign (*Haster*, its own
alert: since when, the robot's slip or the sign it moved, *Vaktmester / renhold, innen 06:30*), the
stranger the robot refused at door after door (*Haster*, *Sikkerhet / resepsjon*), a request the robot handed over (*Haster*), a staff-reported
urgent order, callers waiting for a call back, an arrival without a room, a room out of order, stock
under minimum, the robot's low battery. Routine work stays out (the cleaning route is Oversikt's
primary action).

- **Button:** 44 px icon button with the `bell` icon; a count badge (Martian Mono 12, `text` pill
  with `bg` digits: a calm, high-contrast pill, not red) shows how many are new to this person. Its
  name says it: "Varsler, 3 nye" · "Varsler, 1 ny" · "Varsler, ingen nye" · "Varsler, henter".
- **Sheet** (`Sheet`, light, portalled to `<body>`): "N nye, trenger en person" and *Merk alle som
  sett*; the new alerts, *Haster* first, at most five ("og N til" names the rest as links). A row is
  an icon (`danger` circle for Haster, the module's icon in `warning` otherwise), the title, one line
  of detail, its one action (*Åpne …*, secondary small; taking it counts as seen) and *Marker som
  sett* (ghost). Seen alerts stay listed under **Sett** in `muted`, without colour, so nothing
  disappears without a trace; focus moves to the next new alert, and a polite status says what was
  marked.
- **Seen** is kept per user in this browser (`localStorage` `lobby:varsler-sett:<user>`, try/catch;
  blocked storage holds for the tab). Each alert has a stable id and a level (its count): it is new
  again only when there is more of it than was seen.
- **States:** loading (skeleton rows, "Varsler, henter"); empty ("Ingenting trenger deg nå" with a
  green check: "Roboten og personalet har resten."); a failed night says the robot's alerts are
  missing while the rest still show.

## Typography

Both families are self-hosted through `next/font/google` in `src/app/layout.tsx` (`--font-grotesk`,
`--font-martian`), exposed as Tailwind `font-sans` (the default) and `font-mono`.

| Role | Family | Weights | Sizes (px) | Why |
|---|---|---|---|---|
| Titles | Schibsted Grotesk | 700 | 32 (phone) · 48 (desktop) for a screen's name; 20 for a panel's | A grotesk drawn for a Norwegian publisher: plain, sturdy, with real æ ø å. Tight tracking as size grows: −0.01 em at 20, −0.02 em at 32, −0.03 em at 48. |
| Text | Schibsted Grotesk | 400, 500, 600 | 12 · 14 · 16 · 20 | Body 16/24; dense lists 14/20; labels, hints and source notes 12/16. 600 for the name in a row, 500 for group labels. |
| Figures and identifiers | Martian Mono | 400, 500 | 12 (room numbers on tiles, ids) · 24 (figures, the clock) · 32 (a large figure) | Only for data people compare: counts, percentages, the clock, room numbers, request ids. Wide and even, reads like a shelf label. Always `tabular-nums`. A figure's separators and words (the decimal comma, the thousands space, "ca.", " %") are set in the text face by `Figure` (`src/ui/Figure.tsx`, used by `Stat`), or a monospace reads "4,7" as "4 , 7". |

Type scale (Tailwind names, `globals.css`): `xs` 12/16 · `sm` 14/20 · `base` 16/24 · `lg` 20/28 ·
`xl` 24/30 · `2xl` 32/38 · `3xl` 48/52 · `display` 72/72. Under 640 px a screen's title steps down
one (`text-2xl sm:text-3xl`). No all-caps, no eyebrows above headings, no italics in body copy.

## Color

Contrast measured with the WCAG 2 formula. Body text ≥ 4.5:1 against its background; large text and
UI parts ≥ 3:1. The accent fills a button with ink text, never white text (white on orange is 2.9:1).

| Token | Light (default) | Dark | Use | Contrast (light / dark) |
|---|---|---|---|---|
| `--bg` | `#e9ecee` | `#121c24` | page: concrete / night steel | — |
| `--surface` | `#ffffff` | `#1a2630` | panels, sheets, the rail | — |
| `--sunken` | `#f3f5f6` | `#22313d` | wells, inputs, skeletons, hover, quiet tiles | — |
| `--line` | `#d3d9dd` | `#2e3e4a` | panel borders, row dividers, the rule under figures (decorative) | — |
| `--line-strong` | `#7a858d` | `#6a7c89` | input edges, secondary-button edge, the Opptatt tag | 3.77 / 3.56 on surface |
| `--text` | `#161c21` | `#e8edf0` | text, headings, figures | 17.18 / 13.05 on surface; 14.48 / 14.63 on bg |
| `--muted` | `#4f5a63` | `#9aaab5` | labels, hints, inactive items | 7.06 / 6.45 on surface; 5.95 / 7.22 on bg |
| `--accent` | `#ff6a13` | `#ff7a2b` | the one primary action per screen; the robot; the nav mark | — |
| `--on-accent` | `#161c21` | `#121c24` | text on the accent | 5.99 / 6.63 |
| `--accent-text` | `#b03e00` | `#ff9a5c` | orange as text: links, *Åpne*, the accent badge, the active icon | 5.94 / 7.35 on surface; 4.96 / 6.69 on accent-soft |
| `--accent-soft` | `#ffe6d6` | `#3f2616` | accent badge and monogram background | — |
| `--success` / `-soft` | `#1b7340` / `#e2f1e7` | `#4cc27a` / `#1c3a2a` | klar, fullført, saved metres | 5.88 / 6.82 on surface; 5.03 / 5.51 on soft |
| `--warning` / `-soft` | `#8a5800` / `#fbefd6` | `#f0b43c` / `#3d3118` | må vaskes, venter, ring tilbake, low battery | 6.04 / 8.28 on surface; 5.30 / 6.84 on soft |
| `--danger` / `-soft` | `#be2418` / `#fbe4e1` | `#ff7666` / `#40221f` | avvik, feilet, høy prioritet, stengt | 6.08 / 5.89 on surface; 5.00 / 5.48 on soft |
| `--focus` | `#161c21` | `#e8edf0` | 2 px keyboard focus ring, offset 2 px | same as text |
| `--scrim` | ink at 48 % | night at 64 % | behind a sheet | — |

Hue check: the accent sits at ~22°, danger at ~5°, warning at ~39°, success at ~144°. The accent is
never used for a state, and danger and warning always come with their word, so the robot's orange is
not read as a warning. `success` on the concrete page (`bg`) is 4.95:1, enough for the greeting's
verdict and the figures that sit there.

**Where colour goes (team lead 2026-11-08).** Good news is green (`success`) or neutral; red and
amber are for what needs a person, and that lives in the bell, on alerts that are new. On Oversikt
and the screens the jury sees first (Rom, Forespørsler, Natteskift) a figure is `success` when it is
good and plain otherwise: no amber "Venter", no red "Feilet", no red avvik; the counts stay, only the
alarm colour goes. The few exceptions are states, not news: a *Må vaskes* tile (the primary action's
rooms), an error (`ErrorState`), and a status badge in a module's own list. One rule for urgency on a
list (jury round 3, the design juror): the most urgent item is never the quietest. On Overlevering's *Åpent
nå* the *Sikkerhet* badge is `danger`, the bell's *Haster* red for the same items, and *Gjest venter*
stays `warning` below it.

**Room states** live in one map, `src/ui/roomStatus.ts` (word, token, icon), that Rom og renhold,
Oversikt's widget, Ruter and the 3D hotel all read: Klar `success` (a `success-soft` tile on the
racks, so ready rooms read green at a glance) · Må vaskes `warning` (loud: a `warning-soft` tile) ·
Opptatt `line-strong` tag on a quiet `sunken` tile · Ikke forstyrr `text` outline (a door hanger) ·
Ikke sjekket dashed `line-strong`. *Avvik is not a status:* it is a quiet ink marker (a 3 px `text`
left edge and the word, with a count; a `muted` icon on Oversikt's small tiles) drawn over whatever
status the room has; what it needs is on Vedlikehold and in the bell. A legend icon for a status no
room is in stays `muted`. The robot is `accent`.
One look per state, from the same file: `tag` (the key tag beside the word) and `tile` (the rack's
pigeonhole); `RoomStatusTag` draws tag + word for lists, sheets and panels instead of a coloured badge;
`AvvikMark` draws the ink marker with its count ("1 åpent avvik", never a red badge); `roomPaint(status,
avvik)` tells plans and the 3D hotel the fill token and an ink outline for an avvik (a room known only by its
avvik is painted *Ikke sjekket* with the outline, never a red fill).

## Spacing and radii

- **Spacing:** 4 px grid in the steps 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64. Rhythm: 4–8 inside a
  group, 24 between groups, 24 (phone) / 32 (desktop) between sections. Page gutters 16 (phone) · 24
  (tablet) · 40 (desktop); content up to 1600 px wide. Panels 20 px padding (24 from 640 px). Touch
  targets ≥ 44 px (`min-h-11` links; `pointer-coarse:` grows the 40 px small button to 44).
- **Radii:** `sm` 6 px (badges, nav items, room tiles, small controls) · `md` 10 px (buttons,
  skeletons, the sheet's top) · `lg` 16 px (panels) · `full` (monogram, the voice orb, the sheet
  handle).
- **Depth:** flat. Surfaces step by colour and a 1 px `line`; no drop shadows.

## Motion

GSAP (`gsap` + `@gsap/react`, `useGSAP` with a scope) for entrances and anything sequenced; the
`motion` package stays inside the Sheet and ShirazIQ's existing screens. Presets in `src/ui/motion.ts`
(`fadeRise`, `sheetIn`, `drawLine`; each takes the reduced-motion flag and returns no-op variants when
it is on). Everything respects `prefers-reduced-motion` (GSAP via `gsap.matchMedia`, CSS via the
global rule): content appears in place, the robot jumps.

- **Durations:** 120 ms (press, hover colour) · 150 ms (the nav mark fades in) · 180 ms (small
  things, the sheet's exit) · 240 ms (entrances, sheet in). Replays run at sim pace (they show a change
  over time) and are the one exception.
- **Easing:** `ease-standard` `cubic-bezier(0.23, 1, 0.32, 1)` for anything entering or answering a
  tap; `ease-move` `cubic-bezier(0.77, 0, 0.175, 1)` for things moving on screen; `ease-exit`
  `cubic-bezier(0.4, 0, 1, 1)` out. Never ease-in, no springs, no overshoot, nothing from `scale(0)`.
- **Where:** a screen's panels (`data-enter`) rise 8 px once, 50 ms apart, when its data is ready;
  room tiles (`data-tile`) fade in; pressables scale to 0.97 on `:active`; a loading button runs a
  thin bar along its bottom edge; the nav mark fades, it does not slide; the sheet rises; the robot
  walks its real route; the route draws itself. Motion answers an action or shows a change, never
  decorates.
- **Ambient (Vanta FOG, `three-vanta`):** behind the login page only, night-steel tones at low
  contrast, paused when the tab is hidden, off under reduced motion, never behind text without a solid
  surface between. Working screens have no backdrop.

## States

Every screen that loads or submits has all four:

- **Loading:** `Skeleton` blocks in the shape of the content (a slow opacity pulse). A figure keeps
  its label under a skeleton. Buttons that submit stay labelled, go disabled and run a thin bar along
  their bottom edge. No spinners.
- **Empty:** `EmptyState`: what is missing, one line on how to fill it, and the action that does it.
  Honest when a service isn't connected ("Resepsjonisten er ikke koblet til ennå") or nothing is
  waiting ("Ingen rom må vaskes", "Ingenting venter på noen akkurat nå.").
- **Error:** `ErrorState` (`role="alert"`): a red rule on the left, what happened, what to do next, and
  the action ("Fikk ikke lastet natten" · "Sjekk nettet og prøv igjen." · *Prøv igjen*). The rest of
  the screen stays: a failed night hides the rooms and the robot, not the guests or the stores.
- **Success:** the result itself plus a `success` badge or figure.
- **Hover / focus / disabled** derive from the tokens: hover `bg-sunken` or 105 % brightness; focus a
  2 px `focus` ring offset 2 px; disabled 50 % opacity, cursor `not-allowed`.

## Components

All in `src/ui/`, exported from `src/ui/index.ts`. The module frame lives in
`src/features/modules/ModulePage.tsx`.

| Component | Variants / props | Treatment |
|---|---|---|
| `Button` | `variant` primary · secondary · ghost; `size` sm (40) · md (48) · lg (56); `loading` | Primary: `accent` fill, `on-accent` text. Secondary: `surface` with a `line-strong` edge. Ghost: text only. Radius `md`, 600, `active:scale-[0.97]`. One primary per screen. `buttonClasses()` styles a `next/link` as a button. |
| `Card` | `tone` surface · sunken | A panel: `surface` (or `sunken` on a surface), 1 px `line`, radius `lg`, 20–24 px padding, no shadow. |
| `PageHeader` | `title`, `lede`, `meta`, `actions` | The screen's name (32/48, 700), the lede under it in `muted` (≤ 56 ch), the actions on the right. |
| `ModulePage` / `FigureRow` / `PanelHead` | `module`, `lede`, `actions`, `ready`, `surface` | The frame every module screen shares: header from the registry, the figures on one rule, panels marked `data-enter`. `PanelHead`: a panel's name with its count, a note or its own action. |
| `Badge` | `tone` neutral · accent · success · warning · danger | Soft background, strong text, radius `sm`, 12 px 600. |
| `Stat` | `label`, `value`, `unit`, `tone` (default · accent · success · warning · danger), `size` | Value in Martian Mono 500 (`xl`, or `2xl` when `size="lg"`), tabular; the unit small in the text face beside it; the label below in `muted`. The tone says whether the figure is good or bad. |
| `TopBar` (dashboard) | `night`, `robot`, `source`, `loading` | The 64 px dark bar on Oversikt. |
| `Greeting` (dashboard) | `data` | The h1 greeting by the hour, the night's verdict and summary in one sentence, and the screen's one primary action. |
| `KpiStrip` (dashboard) | `data` | Up to six good-news figures on one rule (`selectHighlights`), `success` or neutral. |
| `NotificationBell` (notifications) | `viewerUrl`; the view takes `alerts`, `loading`, `nightFailed`, `user` | The bell in the navigation: count badge, sheet of alerts with one action each, *Marker som sett* / *Merk alle som sett* per user. See "The bell". |
| `SourceNote` (modules) | `sources` | One `xs` `muted` line under a list saying where its figures come from. |
| `SourceSwitch` (nightsource) | `value`, `onChange`, `sources` | *Natten fra* · *Med robot* / *Uten robot*: the pressed-button pair of Natteskift's *Robotlogg* (a `sunken` well, the chosen one on `surface`, `aria-pressed`, 40 px, 44 on touch). Under *Uten robot* one `xs` `muted` line names what the page rests on (the booking system, the door lock's one signal per room, the night clerk's entries and how many are examples) and what is test data. The choice lives in the address (`?kilde=uten-robot`). |
| `Sheet` | `open`, `onClose`, `title` | Bottom sheet, `role="dialog"`, Escape and scrim close it, focus returns to the opener. |
| `Skeleton` | `className` | `sunken`, pulse, `aria-hidden`. |
| `EmptyState` / `ErrorState` | `title`, `body`, `action` | As above. |
| `AppNav` | `bell` | Desktop (≥ 1024 px): a 232 px dark rail with the bell beside the name at the top (not for the host, nor on the host's screens), the labelled groups (the admin's: Oversikt, *Piloten*, *Utenfor piloten* folded) and the user plate bottom-left. Phone: a 56 px dark top bar (name, bell) and a 64 px dark bottom bar with the role's first four pinned screens and *Meny*, which opens a sheet with every group, each screen's hint and the user plate. Filtered by `canAccess(effectiveRole, path)`. The active item carries a 2 px `accent` mark on its left (rail) or top (bar) that fades in, and its icon in `accent-text`. |
| `UserPlate` | — | Generated monogram (no photos), name, role; opens a menu with the view switcher for admins (Admin · Resepsjonist · Robotansvarlig, calls `switchView`) and *Logg ut*. |
| `Monogram` | `name`, `size` | Initials on `accent-soft`, `accent-text`; the robot's is `accent` with `on-accent`. |
| `ViewAsBanner` (auth) | — | The band under the top edge while an admin views as another role: "Viser som Resepsjonist · Tilbake til admin". |
| icons | `RegenIcon name=…` | Regen Icons (MIT), 24 px grid, 1.75 stroke, `currentColor`, `aria-hidden` unless given a title. No emoji, no other icon set. |

## 3D

The hotel is drawn with three.js, floors stacked, rooms as tiles in their status colour, the robot
as one figure in `accent` with a small light. It reads its colours from the CSS variables of the
surface it mounts on (always dark). Exempt from "flat": soft light only, no glossy materials. A 2D
plan shows the same state when WebGL is missing. On 3D-kart it is the page; Oversikt only links to
it.

## Voice

- **Language:** Norwegian bokmål for all UI text. The voice assistant speaks the guest's language;
  the screen stays in bokmål. The agent's own request texts are shown as quotes (`lang="en"`).
- **Tone:** short, plain, like a good shift lead. Sentence case. Verbs on buttons: *Lag renholdsrute*,
  *Lag sjekkrunde*, *Lag påfyllingsliste*, *Tildel*, *Marker løst*, *Angre*, *Ring tilbake*,
  *Prøv igjen*, *Logg inn*, *Åpne …*.
- **Figures speak Norwegian:** "av 36", "89 %", "og 3 til", "Natt til søndag 8. november".
- **Words we avoid:** "Oops", "Beklager", "Noe gikk galt" alone, English UI words, emoji,
  exclamation marks.
- **Errors** say what happened and what to do next, without apologising.
