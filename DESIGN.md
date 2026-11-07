# Design system

> Every screen reuses these values; components never hard-code a colour, font or size that isn't
> here. Changing a token is a team decision (it changes every screen). The tokens live in
> `src/app/globals.css` (CSS variables + Tailwind `@theme`); Tailwind's own colour and radius
> palettes are switched off there, so only these names exist.

Character: **a calm, precise operations tool for a hotel you trust at 06:00.** (Pivot, team lead
2026-11-07 19:50: Fettero is hotel oversight with AI: one screen for the whole hotel, a robot that works
the night, a receptionist that answers the phone.) Industrial, not
playful: the look of floor tape, shelf labels and a scanner handle, because the person holding it is
working, often new, sometimes in gloves.

## World

- **Nouns:** vare (product), SKU, hylle (shelf), lager (store room), etasje (floor), plukkliste (pick
  list), rute (route), stopp (stop), robot, skift (shift), oppgave (task).
- **Screens:** Hjem (`/`), Øyne (`/oyne`, camera), Ruter (`/ruter`, map), Stemme (`/stemme`, voice),
  Natteskift (`/natteskift`, the robot's shift).
- **Surfaces:** light for working screens (home, Ruter, Stemme); dark for the camera (Øyne), the night
  shift and the navigation. A subtree switches with `data-surface="dark"`; every token flips with it.
  The home cards wear the surface of the screen they open.

## Typography

Both families are self-hosted through `next/font/google` in `src/app/layout.tsx`.

| Role | Family | Weights | Sizes (px) | Why |
|---|---|---|---|---|
| Headings | Schibsted Grotesk | 700, 800 | 24 · 32 · 48 · 72 (wordmark) | A grotesk drawn for a Norwegian publisher: plain, sturdy, with real æ ø å. Tight tracking (−0.02 to −0.045 em) as size grows. |
| Body | Schibsted Grotesk | 400, 500, 600 | 14 · 16 · 20 | One family for the whole UI keeps it calm. Body 16/24, lines under 80 characters. |
| Numbers / mono | Martian Mono | 400, 500 | 14 · 20 · 24 | Only for data: SKUs, metres, seconds, the clock, scores. Wide, stencil-like, reads like a shelf label. Always `tabular-nums`. |

Type scale (Tailwind names): `xs` 12/16 · `sm` 14/20 · `base` 16/24 · `lg` 20/28 · `xl` 24/30 ·
`2xl` 32/38 · `3xl` 48/52 · `display` 72/72. No all-caps labels, no eyebrows above headings.

## Color

Contrast measured with the WCAG 2 formula. Body text ≥ 4.5:1 against its background; large text and
UI parts ≥ 3:1. The accent fills a button with ink text, never white text (white on orange is 2.9:1).

| Token | Light | Dark | Use | Contrast (light / dark) |
|---|---|---|---|---|
| `--bg` | `#e9ecee` | `#121c24` | page background (concrete / night steel) | — |
| `--surface` | `#ffffff` | `#1a2630` | cards, sheets, panels | — |
| `--sunken` | `#f3f5f6` | `#22313d` | wells, skeletons, hover | — |
| `--line` | `#d3d9dd` | `#2e3e4a` | card borders (decorative) | — |
| `--line-strong` | `#7a858d` | `#6a7c89` | input and secondary-button borders | 3.77 / 3.56 on surface |
| `--text` | `#161c21` | `#e8edf0` | body text, headings | 17.18 / 13.05 on surface; 14.48 / 14.63 on bg |
| `--muted` | `#4f5a63` | `#9aaab5` | secondary text, inactive tabs | 7.06 / 6.45 on surface; 5.95 / 7.22 on bg |
| `--accent` | `#ff6a13` | `#ff7a2b` | the one primary action per screen; the floor tape | — |
| `--on-accent` | `#161c21` | `#121c24` | text on the accent | 5.99 / 6.63 |
| `--accent-text` | `#b03e00` | `#ff9a5c` | orange as text (links, accent badge) | 5.94 / 7.35 on surface; 4.96 / 6.69 on accent-soft |
| `--accent-soft` | `#ffe6d6` | `#3f2616` | accent badge background | — |
| `--success` / `-soft` | `#1b7340` / `#e2f1e7` | `#4cc27a` / `#1c3a2a` | done, matched, saved metres | 5.88 / 6.82 on surface; 5.03 / 5.51 on soft |
| `--warning` / `-soft` | `#8a5800` / `#fbefd6` | `#f0b43c` / `#3d3118` | low confidence, check this | 6.04 / 8.28 on surface; 5.30 / 6.84 on soft |
| `--danger` / `-soft` | `#be2418` / `#fbe4e1` | `#ff7666` / `#40221f` | failed, denied, unsafe | 6.08 / 5.89 on surface; 5.00 / 5.48 on soft |
| `--focus` | `#161c21` | `#e8edf0` | 2 px keyboard focus ring, offset 2 px | same as text |
| `--scrim` | ink at 48 % | night at 64 % | behind a sheet | — |

Green, amber and red mean state only, and a word always says the state too.

## Spacing and radii

- **Spacing:** Tailwind's 4 px grid, used in the steps 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64.
  Page gutters 16 (phone) · 32 (tablet) · 48 (desktop). Touch targets ≥ 48 px high (buttons 48 and
  56, tabs 64 and 72).
- **Radii, by size of the thing:** `sm` 6 px (badges, small controls) · `md` 10 px (buttons, tabs,
  skeleton blocks) · `lg` 16 px (cards, sheets) · `full` (the voice orb, the sheet handle).
- **Depth:** flat. Surfaces step by colour and a 1 px border; no drop shadows.

## Motion

Presets in `src/ui/motion.ts` (`fadeRise`, `sheetIn`, `drawLine`); each takes the reduced-motion flag
and returns no-op variants when it is on. CSS animations stop under `prefers-reduced-motion` too
(`globals.css`).

- **Durations:** 150 ms (hover, colour, exits of small things) · 200 ms (tab tape, sheet exit,
  scrim) · 300 ms (entrances, sheet in, one route segment). Nothing longer, nothing that blocks a tap.
- **Easing:** `cubic-bezier(0.2, 0, 0, 1)` in, `cubic-bezier(0.4, 0, 1, 1)` out. No springs, no
  bounce, no overshoot.
- **Where:** home cards rise in once (60 ms apart); the orange tape slides to the active tab; sheets
  rise from the bottom; the route draws itself stop by stop; detection boxes ease to their target; the
  voice orb scales with the audio level. Motion answers an action or shows a change, never decorates.

## States

Every screen that loads or submits has all four:

- **Loading:** `Skeleton` blocks in the shape of the content (a slow opacity pulse). Buttons that
  submit stay labelled, go disabled and run a thin bar along their bottom edge. No spinners.
- **Empty:** `EmptyState`: a heading that says what is missing, one line on how to fill it, and the
  action that does it ("Plukklisten er tom" · "Legg til varer fra Øyne." · *Åpne Øyne*).
- **Error:** `ErrorState` (`role="alert"`): a red rule on the left, what happened, what to do next, and
  the action ("Fikk ikke svar fra serveren" · "Sjekk nettet og prøv igjen." · *Prøv igjen*). Camera and
  microphone denials get their own screen explaining how to allow access.
- **Success:** the result itself (the product card, the drawn route) plus a `success` badge or stat.

## Components

All in `src/ui/`, exported from `src/ui/index.ts`.

| Component | Variants / props | Notes |
|---|---|---|
| `Button` | `variant` primary · secondary · ghost; `size` md (48) · lg (56); `loading` | Only one primary per screen. `buttonClasses()` styles a `next/link` as a button. |
| `Card` | div props | Surface + 1 px line, radius `lg`, 20 px padding. |
| `Sheet` | `open`, `onClose`, `title` | Bottom sheet, `role="dialog"`, Escape and scrim close it. Results and confirmations. |
| `Badge` | `tone` neutral · accent · success · warning · danger | Soft background, strong text, radius `sm`. |
| `Stat` | `label`, `value`, `unit`, `tone` | Value in Martian Mono, tabular. |
| `Skeleton` | `className` (size it) | `aria-hidden`. |
| `EmptyState` | `title`, `body`, `icon`, `action` | |
| `ErrorState` | `title`, `body`, `action` | |
| `AppNav` | — | Bottom tab bar under 1024 px, side rail above; always dark; orange tape marks the active tab; `aria-current="page"`. |
| `ComingSoon` | `title`, `description`, `surface` | Placeholder until a feature screen lands. |
| icons | `EyeIcon`, `RouteIcon`, `MicIcon`, `MoonIcon`, `AlertIcon` | Hand-drawn 24 px, 1.75 stroke, `currentColor`. No icon library, no emoji. |

## Voice

- **Language:** Norwegian bokmål for all UI text. The voice assistant speaks the user's language; the
  screen stays in bokmål.
- **Tone:** short, plain, like a good shift lead. Sentence case. Verbs on buttons: *Identifiser*,
  *Vis vei*, *Legg i plukkliste*, *Beste rute*, *Bekreft*, *Prøv igjen*, *Gå til forsiden*.
- **Words we use:** vare, hylle, lager, etasje, plukkliste, rute, stopp, robot, skift. Numbers with
  units: "212 m", "38 % kortere".
- **Words we avoid:** "Oops", "Beklager", "Noe gikk galt" alone, "Send inn", English UI words, emoji,
  exclamation marks.
- **Errors** say what happened and what to do next, without apologising: "Kameraet er blokkert. Gi
  tilgang i nettleseren og prøv igjen."

## Hotel oversight additions (team lead, 2026-11-07 19:50)

Applies to the oversight dashboard (`/`), the 3D hotel (`/hotell`), Ruter and Natteskift. The rules above
still hold unless a line here says otherwise.

- **World (hotel nouns):** rom, etasje, korridor, heis, robot, oppgave, arbeidsordre, gjest, booking,
  samtale, renhold, romservice, klar, må vaskes, opptatt, ikke forstyrr, avvik.
- **Icons:** Regen Icons (MIT, kazdenc/regen-icons) through `RegenIcon` from `src/ui`. 24 px grid,
  1.75 stroke, `currentColor`. They replace the hand-drawn set on new screens; no emoji.
- **3D:** the hotel is drawn with three.js (`three`), floors stacked, rooms as tiles in their status
  colour, the robot as one distinct shape in `--accent`. The 3D scene is exempt from "flat, no shadows"
  (soft light only, no glossy materials). A 2D fallback shows the same state when WebGL is missing.
- **Motion (GSAP, `gsap` + `@gsap/react`, following greensock/gsap-skills):** the robot moves along its
  real route at sim pace (a replay may run longer than 300 ms because it shows a change over time);
  UI entrances stay within the durations above. Everything stops or jumps to the end state under
  `prefers-reduced-motion`.
- **Ambient background (Vanta, `vanta` with three r134 as `three-vanta`):** only behind the dashboard
  header, low contrast (night steel tones), paused when the tab is hidden and off under reduced motion.
  Never behind text that must be read at 4.5:1 without a solid surface between.
- **Design guidance:** follow emilkowalski/skills (emil-design-eng, animate, animation-performance)
  for craft and animation choices.
