# Design system

> Filled at the rehearsal if the project has a UI (the `ux-engine:design-system` skill writes this
> format). Every screen reuses these values; components never hard-code a colour, font or size that
> isn't here. Changing a token is a team decision (it changes every screen).

Character: **TBD** — one sentence on how it should feel, and why that fits the user.

## World

TBD — the things in the product (the nouns), the screens or surfaces, light or dark by default.

## Typography

| Role | Family | Weights | Sizes (px) | Why |
|---|---|---|---|---|
| Headings | TBD | | | |
| Body | TBD | | | |
| Numbers / mono | TBD | | | |

## Color

| Token | Value | Use |
|---|---|---|
| `--bg` | TBD | page background |
| `--surface` | TBD | cards, panels |
| `--text` | TBD | body text |
| `--muted` | TBD | secondary text |
| `--accent` | TBD | the one primary action per screen |
| `--success` / `--warning` / `--danger` | TBD | states |

Contrast: body text ≥ 4.5:1 against its background; large text and UI parts ≥ 3:1.

## Spacing and radii

TBD — the spacing scale (e.g. 4 · 8 · 12 · 16 · 24 · 32 · 48) and the radius steps.

## States

Every screen that loads or submits has loading, empty, error and success states. TBD — how each looks.

## Components

TBD — the shared components (button, input, card, …), their variants, and where they live in `src/`.

## Voice

TBD — language, tone, words we use and avoid. Error messages say what happened and what to do next.
