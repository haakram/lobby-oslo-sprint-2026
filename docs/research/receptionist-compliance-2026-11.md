# The AI receptionist and Norwegian/EU rules — 2026-11-07

How the receptionist (`src/features/reception/`) meets the rules a hotel in Norway follows, and what a
real hotel must still do before going live. This is our reading for the hackathon, not legal advice.

## What the receptionist does today

| Rule | What it asks | What we built |
|---|---|---|
| **EU AI Act, art. 50** (transparency) | People must be told they are talking to an AI. | The greeting says "Jeg heter Maria og er hotellets virtuelle assistent, en KI"; the agent repeats it after switching language and never claims to be a person. |
| **GDPR art. 13** (information when data is collected), in layers as Datatilsynet recommends | Say who is responsible, why, the legal basis, how long, who receives it, and the guest's rights. | First layer, in the greeting: the call is written down, no sound recording, deleted after 30 days, "spør meg gjerne om personvern". Before taking a name the agent says what it notes, why and when it is deleted. On request (second layer): the controller (Lobby Hotell AS); the purpose; the legal basis (art. 6(1)(b) agreement for a booking, 6(1)(f) legitimate interest for a message); retention; the processor (ElevenLabs, under a DPA); the rights to access, rectification, erasure, restriction, objection and portability by email; the right to complain to Datatilsynet. |
| **GDPR art. 5** (data minimisation, storage limitation) | Collect only what is needed; keep it no longer than needed. | Only name, phone, dates, guests, room and message. Never fødselsnummer, passport, date of birth, address, email or card numbers (card numbers are also stripped in code by `scrubText`). No audio is recorded (`recordVoice: false`); transcripts are deleted after 30 days (`retentionDays`). What the receptionist took down is deleted by code (`retention.ts`): a message 30 days after the call, a booking 30 days after departure; every card shows its deletion date. |
| **GDPR art. 9** (special categories) | Health and similar data need explicit consent. | The agent does not ask for health details; it notes an accessibility need only after the guest says yes to "May I write that down?". |
| **GDPR art. 22 / fairness** | No decision with legal or similarly significant effect by machine alone. | The agent confirms a booking only when code finds the room free, at the price the code computes; it cannot refuse anyone a room on its own judgement. Payment is at arrival, never over the phone. Staff see every booking and can cancel it (*Avbestill*). A guest can always ask for a human and gets a callback. |
| **Transparency of what is noted** | The guest should know what was written down. | The agent reads every request back before recording it, then tells the guest exactly what was noted and that only staff see it. |
| **Likestillings- og diskrimineringsloven § 17–18** (universell utforming of ICT) and **WCAG 2.1 AA** | Services must be usable by everyone. | Plain short sentences, one question at a time, slower speech, repetition and spelling on request, 30 s before a silent call ends, 38 languages including Norwegian. The hotel facts include step-free access, accessible rooms and assistance dogs. The staff screen is built on the app's design system (`DESIGN.md`). |
| **Markedsføringsloven / prisopplysning** | Prices must be correct and complete. | Prices come only from tools over one price table; the agent may not invent discounts. |
| **Bokføringsloven § 13** (bookkeeping) | Accounting documents (the receipt for a paid stay) are kept for 5 years. | The agent says so when asked how long data is kept. The receipt lives in the booking/accounting system, not in the receptionist's notes, which are deleted after 30 days. |
| **GDPR art. 12 and 17** (rights, erasure) | Help the person use their rights; never refuse without reason. | The agent never refuses a privacy request: it takes a message for staff to delete the notes, and gives the privacy email. |
| **Payment security (PCI DSS)** | Card data only through approved channels. | The agent refuses card numbers; payment is handled by staff. |

## Before a real hotel goes live

- **Data processing agreement (DPA)** with ElevenLabs (and Anthropic, through ElevenLabs), and a check
  of transfers outside the EEA. ElevenLabs offers EU data residency; consider it.
- **Record of processing** (art. 30) and a short **DPIA** (art. 35): AI handling calls from the public
  is a case where Datatilsynet expects one.
- **Staff log-in** on `/resepsjon` and `/api/reception/calls` (today anyone with the URL can read the
  call log; fine for a demo with test callers only).
- **Privacy notice** on the hotel's website with the same content the agent reads out.
- A real privacy contact instead of `personvern@lobby.example` (test data).
- A Norwegian phone number with a recorded notice if calls are taken over the phone (see
  `elevenlabs-phone-2026-11.md`).
