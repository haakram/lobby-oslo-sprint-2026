import { HOTEL } from "./hotel";

export type CallPrivacy = { recordVoice: boolean; retentionDays: number };

/**
 * What ElevenLabs keeps of a call to the receptionist. The agent is set up with exactly this
 * (agentConfig.ts) and Resepsjon says it before the call, so the screen cannot promise more than the agent does.
 */
export const CALL_PRIVACY = { recordVoice: false, retentionDays: HOTEL.privacy.retentionDays } as const satisfies CallPrivacy;

/** The notice under *Ring resepsjonen*: where the call goes, what is kept and for how long, and the demo's ask. */
export function callNotice(privacy: CallPrivacy = CALL_PRIVACY): string {
  const kept = privacy.recordVoice
    ? `Lydopptaket og teksten slettes etter ${privacy.retentionDays} dager.`
    : `Ingen lydopptak lagres, og teksten slettes etter ${privacy.retentionDays} dager.`;
  return (
    "Samtalen går til ElevenLabs (USA), som sender teksten til Claude (Anthropic, USA) for å svare. " +
    `${kept} Dette er en demo: bruk et oppdiktet navn og nummer.`
  );
}
