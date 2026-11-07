# The AI receptionist and Norwegian/EU rules — 2026-11-07

How the receptionist (`src/features/reception/`) meets the rules a hotel in Norway follows, and what a
real hotel must still do before going live. This is our reading for the hackathon, not legal advice.

## What the receptionist does today

| Rule | What it asks | What we built |
|---|---|---|
| **EU AI Act, art. 50** (transparency) | People must be told they are talking to an AI. | The greeting says "Jeg er hotellets KI-assistent"; the agent repeats it after switching language and never claims to be a person. |
| **GDPR art. 13** (information when data is collected) | Say who is responsible, why, how long, and the guest's rights. | The greeting says the request is written down. On request the agent names the controller (Hotell Nattskift AS), the purpose, 30-day deletion, the email for access/correction/deletion, and the right to complain to Datatilsynet. |
| **GDPR art. 5** (data minimisation, storage limitation) | Collect only what is needed; keep it no longer than needed. | Only name, phone, dates, guests, room and message. Never fødselsnummer, passport, date of birth, address, email or card numbers (card numbers are also stripped in code by `scrubText`). No audio is recorded (`recordVoice: false`); transcripts are deleted after 30 days (`retentionDays`). |
| **GDPR art. 9** (special categories) | Health and similar data need explicit consent. | The agent does not ask for health details; it notes an accessibility need only after the guest says yes to "May I write that down?". |
| **GDPR art. 22 / fairness** | No important decision made by machine alone. | The agent never books or confirms: it records a *request*; staff confirm by phone. A guest can always ask for a human and gets a callback. |
| **Transparency of what is noted** | The guest should know what was written down. | The agent reads every request back before recording it, then tells the guest exactly what was noted and that only staff see it. |
| **Likestillings- og diskrimineringsloven § 17–18** (universell utforming of ICT) and **WCAG 2.1 AA** | Services must be usable by everyone. | Plain short sentences, one question at a time, slower speech, repetition and spelling on request, 30 s before a silent call ends, 38 languages including Norwegian. The hotel facts include step-free access, accessible rooms and assistance dogs. The staff screen is built on the app's design system (`DESIGN.md`). |
| **Markedsføringsloven / prisopplysning** | Prices must be correct and complete. | Prices come only from tools over one price table; the agent may not invent discounts. |
| **Payment security (PCI DSS)** | Card data only through approved channels. | The agent refuses card numbers; payment is handled by staff. |

## Before a real hotel goes live

- **Data processing agreement (DPA)** with ElevenLabs (and Anthropic, through ElevenLabs), and a check
  of transfers outside the EEA. ElevenLabs offers EU data residency; consider it.
- **Record of processing** (art. 30) and a short **DPIA** (art. 35): AI handling calls from the public
  is a case where Datatilsynet expects one.
- **Staff log-in** on `/resepsjon` and `/api/reception/calls` (today anyone with the URL can read the
  call log; fine for a demo with test callers only).
- **Privacy notice** on the hotel's website with the same content the agent reads out.
- A real privacy contact instead of `personvern@nattskift.example` (test data).
- A Norwegian phone number with a recorded notice if calls are taken over the phone (see
  `elevenlabs-phone-2026-11.md`).
