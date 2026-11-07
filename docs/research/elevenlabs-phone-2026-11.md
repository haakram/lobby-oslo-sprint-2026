# A phone number for the receptionist — research, 2026-11-07

Read from the ElevenLabs docs (Context7, `/websites/elevenlabs_io`): "Twilio native integration",
"Import phone number" (`POST /v1/convai/phone-numbers`), "Dynamic variables", "List conversations".
Nothing here has been bought or created. **Every step marked $ costs money and needs ShirazIQ's yes.**

## How it works

ElevenLabs can take calls on a **Twilio** number and hand them to an agent. The caller talks to the
same receptionist as in the browser; ElevenLabs does speech, turn-taking, the LLM and the voice.

| Twilio number type | Inbound (guests call in) | Outbound |
|---|---|---|
| Purchased Twilio number | yes | yes |
| Verified caller ID (an existing number) | **no** | yes |

So for "guests call the hotel" we need a **purchased** Twilio number.

## Why the tools change for the phone

In the browser the receptionist's tools run in the page (client tools). A phone call has no page, so
the tools must be **webhook tools**: ElevenLabs calls our server at
`<RECEPTION_PUBLIC_URL>/api/reception/tools/<tool>` with the header `x-reception-secret`. The secret is
stored at ElevenLabs as a workspace secret, never in the agent's prompt. Our setup script switches to
webhook tools when `RECEPTION_PUBLIC_URL` is set.

## Steps, in order

1. Deploy the app (Vercel) so `/api/reception/tools/*` is reachable on `https://`.
2. Set `RECEPTION_PUBLIC_URL` (the deploy URL) and `RECEPTION_TOOL_SECRET` (a random string, at least
   24 characters) in `.env` and in the Vercel project settings. Never in git.
3. Re-run `npx tsx --conditions=react-server --env-file=.env src/features/reception/setup-agent.ts`. It
   creates the workspace secret and updates the agent to webhook tools. (Creating/updating the agent
   needs ShirazIQ's yes.) **Warning:** stay in client mode for the browser demo. In webhook mode all
   tool calls go to the server, so "Denne samtalen" stays empty and requests appear only in
   Samtalelogg after the call. Use a separate phone agent if you need both.
4. **$** Create a Twilio account and buy a number with **voice** capability. A Norwegian (+47) number
   needs Twilio's regulatory bundle (business name and address, approval can take days); a US or UK
   number is usually available at once and is enough for a demo.
5. **$** Import it into ElevenLabs and assign the receptionist: dashboard *Agents → Phone numbers →
   Import → Twilio* (phone number, label, Twilio Account SID, Auth Token), then pick the agent. Or with
   the SDK: `phoneNumbers.create({ provider: "twilio", phoneNumber, label, sid, token, agentId })`.
   Turn SMS off (`enable_sms: false`) unless we want it.
6. Call the number. The call shows up in `/resepsjon` → *Samtalelogg* after it ends (ElevenLabs'
   post-call analysis fills in name, number, dates and summary).

## What costs money

- **Twilio:** the number (monthly rent, a few USD for a US/UK number; more for +47) plus per-minute
  inbound charges. Check current prices in the Twilio console before buying.
- **ElevenLabs:** agent minutes come out of the Creator plan's credits, phone or browser alike. The
  LLM (Claude) is included by ElevenLabs, not our Anthropic key.
- Nothing from the team's USD 30 Claude API budget.

## Must fix before a real, public number

- `/resepsjon` and `/api/reception/calls` have **no staff log-in**: anyone with the URL can read
  callers' names and numbers. Fine for a demo with test callers; add a staff PIN or log-in before a
  real number goes live (`TODO(phase-3)`).
- Webhook-recorded requests are not stored by us; the call log reads them from ElevenLabs.
- The agent's `callLimits` (3 at once, 200 a day) cap the bill if the number leaks.
- Not verified yet: whether the agent's `auth.enableAuth: true` (only our server can start browser
  sessions) affects inbound Twilio calls. Make one test call right after importing the number.
- Re-running setup in webhook mode creates another workspace secret named `reception-tool-secret`;
  delete the old one in the ElevenLabs dashboard, or fix the script to reuse it.
