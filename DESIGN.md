# Design system: Lobby

> Every screen reuses these values; components never hard-code a colour, font or size that isn't
> here. Changing a token is a team decision (it changes every screen). The tokens live in
> `src/app/globals.css` (CSS variables + Tailwind `@theme`); Tailwind's own colour and radius
> palettes are switched off there, so only these names exist.

Character: **the hotel seen from the night desk.** Lobby is hotel oversight with AI: one screen for the
whole hotel, a robot that works the night, a receptionist that answers the phone. The look comes from
the hotel's own things, not from dashboards: the key rack behind the desk (a wall of numbered
pigeonholes), the night audit printed at 06:00, brass room numbers, a lamp on the desk, and the blue
hour outside the window. Warm and dark, with one cool light: the robot.

(Redesign, team lead 2026-11-07 20:30: "it looks way too AI". Decided with ux-engine visual-character
and emil-design-eng; the previous "floor tape and scanner" direction is retired.)

## Character, one decision per axis

- **Type: high contrast, two families.** *Bodoni Moda* (a hotel's engraved-plate face) for the title
  of a screen, the clock, room numbers and the big figures, from 28 px up; *Schibsted Grotesk* for
  everything you read. Monospace only for identifiers (request ids like `R-068`, shift ids), never
  for ordinary figures: figures use the text face with `tabular-nums`.
- **Colour: warm umber neutrals, one cool signature.** The product lives at night; its neutrals are
  the dark wood and lamplight of a lobby at 02:00, not blue-grey steel. The signature is *blåtime*
  blue (the Norwegian blue hour) and appears in exactly two places: the one primary action on a
  screen, and the robot (in 3D, on plans, in its badge). Status green, amber and red mean state only.
- **Space: composed and dense inside, generous between.** 4 px grid; 4–8 px inside a group, 24 px
  between groups, 40–64 px between sections. At 1280 px and up a screen is composed across the
  canvas (a header band, two or three columns, display type), never a narrow column.
- **Finish: flat planes.** Surfaces separate by tone (`bg` → `surface` → `sunken`), with no borders
  around panels and no shadows. A hairline `line` is used only *inside* a panel: row dividers, the
  rack's grid, an input's edge. Radii are small and consistent: 4 px controls and tiles, 8 px panels.
- **One memorable element per screen,** taken from the hotel: the key rack on Oversikt; the hotel
  itself, edge to edge, on 3D-kart; the day ledger on the receptionist's desk; the robot's task set
  as one display line on the robot manager's desk; the lift indicator (floor numbers) in Ruter.

## World

- **Nouns:** rom, etasje, korridor, heis, robot, oppgave, arbeidsordre, gjest, booking, samtale,
  renhold, romservice, klar, må vaskes, opptatt, ikke forstyrr, avvik; vare, plukkliste, rute, stopp.
- **Screens, grouped by job** (the navigation uses these groups):
  *Hotellet:* Oversikt (`/`), 3D-kart (`/hotell`), Ruter (`/ruter`).
  *Roboten:* Natteskift (`/natteskift`), Øyne (`/oyne`, "Robotens øyne"), Stemme (`/stemme`, "Snakk
  gjennom roboten"). *Resepsjon:* Resepsjon (`/resepsjon`).
- **Surfaces:** **Natt** (default, the root) for the hotel and the robot; **Dag** (paper) for the
  receptionist's desk (`/resepsjon` and the receptionist dashboard). A subtree switches with
  `data-surface="light"` / `"dark"`; every token flips with it. The navigation is always Natt.
- **Roles:** admin sees everything and can view as another role; resepsjonist and robotansvarlig get
  their own desk on `/` and only their screens in the navigation (`src/features/auth/roles.ts`).

## Typography

All three families are self-hosted through `next/font/google` in `src/app/layout.tsx`
(`--font-display`, `--font-grotesk`, `--font-martian`).

| Role | Family | Weights | Sizes (px) | Why |
|---|---|---|---|---|
| Display | Bodoni Moda (opsz axis on) | 500, 600 | 28 · 40 · 56 · 72 | The face of brass plates and hotel monograms; its hairlines want size, so never under 28 px and never for running text. Clock, room numbers and big figures are set in it (`font-display tabular-nums`). |
| Text | Schibsted Grotesk | 400, 500, 600, 700 | 13 · 14 · 16 · 18 | A grotesk drawn for a Norwegian publisher, with real æ ø å. Body 16/24; dense lists 14/20; small labels 13/16. Section headings 18/24 at 600, `tracking-[-0.01em]`. |
| Identifiers | Martian Mono | 400, 500 | 12 · 13 | Only for codes people compare character by character: request ids, shift ids, seeds. |

Type scale (Tailwind names): `xs` 13/16 · `sm` 14/20 · `base` 16/24 · `lg` 18/24 · `xl` 28/32 ·
`2xl` 40/44 · `3xl` 56/60 · `display` 72/72. Under 640 px display sizes step down one (`text-xl
sm:text-2xl`). No all-caps, no eyebrows above headings, no italics in body copy.

## Color

Contrast measured with the WCAG 2 formula (`node contrast.mjs` in ux-engine visual-character). Body
text ≥ 4.5:1 against its background; large text and UI parts ≥ 3:1. The signature fills a button with
`on-accent` text (10.6:1 at night, 7.1:1 by day).

| Token | Natt (default) | Dag | Use | Contrast (natt / dag) |
|---|---|---|---|---|
| `--bg` | `#16120f` | `#e9e1d2` | page: dark walnut / paper | — |
| `--surface` | `#211b17` | `#f7f2e8` | panels, sheets | — |
| `--sunken` | `#2b231e` | `#efe8db` | wells, inputs, skeletons, hover | — |
| `--line` | `#3a3029` | `#d9d0c0` | hairlines inside panels (decorative) | — |
| `--line-strong` | `#7d7062` | `#857868` | input edges, secondary button edge | 3.54 / 3.85 on surface |
| `--text` | `#f3ecdf` | `#1c1612` | ivory / ink | 14.49 / 16.05 on surface |
| `--muted` | `#b5a897` | `#5b5247` | secondary text | 7.30 / 6.86 on surface; 7.99 / 5.89 on bg |
| `--accent` | `#a9c4f5` | `#1f4f9a` | the primary action; the robot | 10.56 / 7.12 against on-accent |
| `--on-accent` | `#16120f` | `#f7f2e8` | text on the signature | same |
| `--accent-text` | `#a9c4f5` | `#1f4f9a` | the signature as text (links, the robot's word) | 10.0 / 7.12 on surface; 7.33 / 6.32 on accent-soft |
| `--accent-soft` | `#253246` | `#dde6f5` | the robot's badge | — |
| `--success` / `-soft` | `#4cc27a` / `#1f3a2a` | `#1b7340` / `#dfeee4` | klar, fullført | 7.54 / 5.27 on surface; 5.48 / 4.89 on soft |
| `--warning` / `-soft` | `#f0b43c` / `#3f3118` | `#8a5800` / `#f6e9cf` | må vaskes, ring tilbake, check this | 9.16 / 5.41 on surface; 6.79 / 5.03 on soft |
| `--danger` / `-soft` | `#ff7666` / `#45241f` | `#be2418` / `#f6ddd8` | avvik, feilet, denied | 6.51 / 5.45 on surface; 5.27 / 4.70 on soft |
| `--focus` | `#f3ecdf` | `#1c1612` | 2 px keyboard focus ring, offset 2 px | same as text |
| `--scrim` | ink at 64 % | ink at 48 % | behind a sheet | — |

Hue check: the signature sits at ~218°, danger at ~6°, warning at ~40°, success at ~145°: the signature
is more than 40° from every status colour, so the robot is never read as a warning or a fault.

**Room states** (one word and one colour each, legend always shown): Klar `success` · Må vaskes
`warning` · Opptatt `sunken` tile with `muted` word · Ikke forstyrr `text` outline (a door hanger) ·
Avvik `danger` marker in the corner · Ikke sjekket dashed `line-strong`. The robot is `accent`.

## Spacing and radii

- **Spacing:** 4 px grid in the steps 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64. Rhythm: 4–8 inside a
  group, 24 between groups, 40 (phone) / 64 (desktop) between sections. Page gutters 16 (phone) · 24
  (tablet) · 40 (desktop); content up to 1600 px wide. Touch targets ≥ 44 px (`pointer-coarse:` grows
  32 px desktop controls).
- **Radii:** `sm` 4 px (controls, tiles, badges) · `md` 8 px (panels, sheets, the 3D frame) · `full`
  (avatar, the voice orb). Nothing else (`lg` is an alias of `md` for older code).
- **Depth:** flat planes. No shadows, no borders around panels.

## Motion

GSAP (`gsap` + `@gsap/react`, `useGSAP` with a scope) for entrances and anything sequenced; the
`motion` package stays only inside the Sheet and ShirazIQ's existing screens. Presets in
`src/ui/motion.ts`. Everything respects `prefers-reduced-motion` (GSAP via `gsap.matchMedia`, CSS via
the global rule): content appears in place, the robot jumps.

- **Durations:** 120 ms (press, hover colour) · 180 ms (small things, popovers) · 240 ms (entrances,
  sheet in) · 400 ms (crossfade between role views). Replays run at sim pace (they show a change over
  time) and are the one exception.
- **Easing:** out `cubic-bezier(0.23, 1, 0.32, 1)` for anything entering or answering a tap; in-out
  `cubic-bezier(0.77, 0, 0.175, 1)` for things moving on screen. Never ease-in, no springs, no
  overshoot, nothing from `scale(0)`.
- **Where:** a screen's panels rise 8 px once, 50 ms apart; pressables scale to 0.97 on `:active`; the
  nav mark fades, it does not slide; the sheet rises; the robot walks its real route; the route
  draws itself. Motion answers an action or shows a change, never decorates.
- **Ambient (Vanta FOG, `three-vanta`):** behind the dashboard header band only, umber tones at low
  contrast, paused when the tab is hidden, off under reduced motion, never behind text without a
  solid surface between.

## States

Every screen that loads or submits has all four:

- **Loading:** `Skeleton` blocks in the shape of the content (a slow opacity pulse). Buttons that
  submit stay labelled, go disabled and run a thin bar along their bottom edge. No spinners.
- **Empty:** `EmptyState`: what is missing, one line on how to fill it, and the action that does it.
  Honest when a service isn't connected ("Resepsjonisten er ikke koblet til ennå").
- **Error:** `ErrorState` (`role="alert"`): a red rule on the left, what happened, what to do next, and
  the action ("Fikk ikke svar fra serveren" · "Sjekk nettet og prøv igjen." · *Prøv igjen*).
- **Success:** the result itself plus a `success` badge or figure.
- **Hover / focus / disabled** derive from the tokens: hover `bg-sunken` or 92 % brightness; focus a
  2 px `focus` ring offset 2 px; disabled 50 % opacity, cursor `not-allowed`.

## Components

All in `src/ui/`, exported from `src/ui/index.ts`.

| Component | Variants / props | Treatment |
|---|---|---|
| `Button` | `variant` primary · secondary · ghost; `size` sm (36) · md (44) · lg (52); `loading` | Primary: `accent` fill, `on-accent` text. Secondary: `surface` with a `line-strong` edge. Ghost: text only. All radius `sm`, `active:scale-[0.97]`. One primary per screen. |
| `Card` | `tone` surface · sunken | A plane: `surface` (or `sunken` on a surface), radius `md`, 20–24 px padding, no border. |
| `PageHeader` | `title`, `lede`, `meta`, `actions` | The screen's title in the display face with the lede beside it; actions on the right. |
| `Badge` | `tone` neutral · accent · success · warning · danger | Soft background, strong text, radius `sm`, 13 px 600. |
| `Stat` | `label`, `value`, `unit`, `tone`, `size` | Value in the display face (`xl`, or `2xl` when `size="lg"`), tabular; label below in `muted`. |
| `Sheet` | `open`, `onClose`, `title` | Bottom sheet, `role="dialog"`, Escape and scrim close it. |
| `Skeleton` | `className` | `sunken`, pulse, `aria-hidden`. |
| `EmptyState` / `ErrorState` | `title`, `body`, `action` | As above. |
| `AppNav` | — | Desktop: a 232 px rail on Natt with three labelled groups and the user plate bottom-left. Phone: a bottom bar with the role's first four screens and *Meny*, which opens a sheet with every group and the user plate. Filtered by `canAccess(effectiveRole, path)`. The active item carries a 2 px `accent` mark on its left (rail) or top (bar) that fades in. |
| `UserPlate` | — | Generated monogram avatar (no photos), name, role; for admins a view switcher (Admin · Resepsjonist · Robotansvarlig) calling `switchView`. |
| `ViewingAs` | — | A thin band under the top edge while an admin views as another role: "Viser som Resepsjonist · Tilbake til admin". |
| icons | `RegenIcon name=…` | Regen Icons (MIT), 24 px grid, 1.75 stroke, `currentColor`. No emoji, no other icon set. |

## 3D

The hotel is drawn with three.js, floors stacked, rooms as tiles in their status colour, the robot
as one figure in `accent` with a small light. It reads its colours from the CSS variables of the
surface it mounts on (always Natt). Exempt from "flat": soft light only, no glossy materials. A 2D
plan shows the same state when WebGL is missing. On Oversikt and the robot manager's desk it sits in
a `panel` frame; on 3D-kart it is the page.

## Voice

- **Language:** Norwegian bokmål for all UI text. The voice assistant speaks the guest's language;
  the screen stays in bokmål. The agent's own request texts are shown as quotes (`lang="en"`).
- **Tone:** short, plain, like a good night manager. Sentence case. Verbs on buttons: *Spill av*,
  *Send renholderne*, *Tildel*, *Marker løst*, *Ring tilbake*, *Prøv igjen*, *Logg inn*.
- **Words we avoid:** "Oops", "Beklager", "Noe gikk galt" alone, English UI words, emoji,
  exclamation marks.
- **Errors** say what happened and what to do next, without apologising.
