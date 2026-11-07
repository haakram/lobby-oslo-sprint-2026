# ElevenLabs for the robot's voice — research, 2026-11-07

Read from the official ElevenLabs agent skills (`github.com/elevenlabs/skills`: `agents`,
`speech-engine`, `text-to-speech`, `speech-to-text`) after connecting the team's account with
`npx -y @elevenlabs/cli@latest onboard`. The key is in Hamad's `.env.local` (OPERATIONS § 4).

**What we want (team lead):** talk to the robot, translate, and talk to guests.

## Two ways to build it

| | **A. Hosted ElevenLabs Agent** (`agents` skill) | **B. Speech Engine** (`speech-engine` skill) |
|---|---|---|
| What ElevenLabs does | Everything: microphone, speech-to-text, the LLM turn, text-to-speech, turn-taking | Voice only: microphone, speech-to-text, turn-taking, text-to-speech |
| Where the brain runs | Inside ElevenLabs, on an LLM we pick. **Claude is on the list:** `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-4-5`, … | Our own server: we stream the reply text back over a WebSocket |
| Robot commands | **Client tools**: functions in our browser app the agent calls (registered with `useConversationClientTool` in React), or webhook tools on a server | Our server decides; transcripts are untrusted input |
| Languages | Built-in `language_detection` system tool switches language when the guest does; `language_presets` per language; multilingual TTS (`eleven_multilingual_v2`: 29 languages, newer models more) | We handle it ourselves |
| Infra | A browser client with `@elevenlabs/react`; agent created once with the API | A public `wss://` URL (ngrok or a deploy), a Speech Engine resource, JWT-verified WebSocket server |
| LLM cost | **Included in ElevenLabs, no extra cost** (team lead confirmed 2026-11-07); not our Anthropic key | Comes out of our USD 30 Anthropic budget |

**Claude's recommendation: A.** It gives Claude as the brain, voice commands that call app
functions, and guest language switching with almost no infrastructure, which suits a demo built by
Sunday 14:00. B only pays off if the voice has to drive Track A's own agent loop, which it doesn't.

## Safety notes from the skills

- Never put `ELEVENLABS_API_KEY` in browser code. The browser gets a short-lived token or signed URL
  from our server (`conversations.get_webrtc_token` / `get_signed_url`).
- Treat speech transcripts as untrusted input: a guest (or audio playing nearby) can say "ignore
  your instructions". Client tools should do only harmless, allowlisted things (show a route,
  highlight a product, queue a task for confirmation), never anything privileged without a tap.
- Don't run the app or make speech to try it until the team lead says yes (CLI rule); run
  `npx -y @elevenlabs/cli@latest onboard check --answered --env-path .env.local` after the code is
  written, to verify the key and the integration.

## Loading the key

The SDK reads `ELEVENLABS_API_KEY` from the environment. Next.js reads `.env.local` on its own;
plain Node: `node --env-file=.env.local`; Python: `load_dotenv(".env")` then `load_dotenv(".env.local")`.
SDKs: `npm install @elevenlabs/elevenlabs-js @elevenlabs/react` or `pip install elevenlabs`.
