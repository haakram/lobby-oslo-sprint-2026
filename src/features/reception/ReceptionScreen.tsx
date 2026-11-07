"use client";

import { ConversationProvider } from "@elevenlabs/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useState } from "react";
import type { VoicePhase, VoiceProblem } from "@/features/voice/useFetteroVoice";
import { Transcript } from "@/features/voice/Transcript";
import { VoiceOrb } from "@/features/voice/VoiceOrb";
import { Button, Card, EmptyState, ErrorState, fadeRise, MicIcon } from "@/ui";
import { CallLogPanel } from "./CallLogPanel";
import { RecordCard } from "./RecordCard";
import type { ReceptionRecord } from "./records";
import { useReceptionVoice } from "./useReceptionVoice";
import { useStaffMarks, type StaffMark } from "./useStaffMarks";

const STATUS: Record<VoicePhase, string> = {
  idle: "Trykk og snakk som en gjest.",
  connecting: "Kobler til resepsjonen …",
  listening: "Lytter",
  speaking: "Resepsjonisten snakker",
};

/** /resepsjon: call the AI receptionist as a guest; staff settle what it took down. */
export function ReceptionScreen() {
  return (
    <ConversationProvider>
      <ReceptionSession />
    </ConversationProvider>
  );
}

function ReceptionSession() {
  // Everything taken down on this page visit, newest first. Staff ticks live in useStaffMarks.
  const [records, setRecords] = useState<ReceptionRecord[]>([]);
  const onRecord = useCallback((record: ReceptionRecord) => {
    setRecords((current) => [record, ...current.filter((r) => r.id !== record.id)]);
  }, []);
  const voice = useReceptionVoice(onRecord);
  const { marks, mark } = useStaffMarks();
  const busy = voice.phase === "connecting";

  return (
    <main data-surface="light" className="flex-1 bg-bg px-4 pt-6 pb-12 text-text sm:px-6 lg:px-10 lg:pt-10">
      <header>
        <h1 className="font-display text-2xl font-medium tracking-[-0.01em] sm:text-3xl">Resepsjon</h1>
        <p className="mt-2 max-w-[56ch] text-base text-muted">
          AI-resepsjonisten tar telefonen døgnet rundt, på gjestens språk. Bookinger og beskjeder venter her
          til du bekrefter dem.
        </p>
      </header>

      <div className="mt-8 grid max-w-6xl gap-8 lg:mt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Samtalekontroll" className="flex flex-col items-center gap-6 lg:pt-4">
            {voice.problem?.kind === "mic-denied" || voice.problem?.kind === "no-mic" ? (
              <MicrophoneProblem problem={voice.problem} onRetry={voice.start} />
            ) : (
              <>
                <VoiceOrb
                  phase={voice.phase}
                  getInputVolume={voice.getInputVolume}
                  getOutputVolume={voice.getOutputVolume}
                />
                <p aria-live="polite" className="min-h-7 text-center text-lg font-medium text-text">
                  {STATUS[voice.phase]}
                </p>
                {voice.connected ? (
                  <Button variant="secondary" size="lg" className="w-full max-w-xs" onClick={voice.stop}>
                    Legg på
                  </Button>
                ) : (
                  <Button size="lg" className="w-full max-w-xs" loading={busy} onClick={() => void voice.start()}>
                    Ring resepsjonen
                  </Button>
                )}
                {voice.problem && <ServiceProblem problem={voice.problem} onRetry={voice.start} />}
              </>
            )}
          </section>
          <Card>
            <Transcript
              turns={voice.turns}
              language={voice.language}
              agentLabel="Resepsjonist"
              emptyText="Trykk Ring resepsjonen og snakk som en gjest. Samtalen vises her."
            />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="records-heading" className="flex flex-col gap-4">
            <h2 id="records-heading" className="text-2xl font-bold tracking-[-0.02em]">
              Denne samtalen
            </h2>
            <Records records={records} marks={marks} onMark={mark} />
          </section>
          <CallLogPanel callActive={voice.connected} />
        </div>
      </div>
    </main>
  );
}

function Records({
  records,
  marks,
  onMark,
}: {
  records: ReceptionRecord[];
  marks: Record<string, StaffMark>;
  onMark: (id: string, value: StaffMark) => void;
}) {
  const reduced = useReducedMotion();
  if (records.length === 0) {
    return (
      <Card>
        <EmptyState title="Ingen forespørsler ennå" body="Bookinger og beskjeder fra samtalen kommer her." />
      </Card>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {records.map((record) => (
          <motion.li key={record.id} variants={fadeRise(reduced)} initial="hidden" animate="visible">
            <RecordCard record={record} mark={marks[record.id]} onMark={(value) => onMark(record.id, value)} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function MicrophoneProblem({ problem, onRetry }: { problem: VoiceProblem; onRetry: () => void }) {
  const denied = problem.kind === "mic-denied";
  return (
    <Card className="flex w-full max-w-md flex-col items-start gap-4">
      <div className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
        <MicIcon className="size-7" />
      </div>
      <h2 className="text-xl font-bold tracking-[-0.02em]">
        {denied ? "Mikrofonen er blokkert" : "Fant ingen mikrofon"}
      </h2>
      {denied ? (
        <>
          <p className="text-base text-muted">Resepsjonisten må høre deg for å svare. Slik gir du tilgang:</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-base text-text">
            <li>Trykk på låsen ved siden av adressen øverst.</li>
            <li>Slå på Mikrofon for denne siden.</li>
            <li>Trykk Prøv igjen.</li>
          </ol>
        </>
      ) : (
        <p className="text-base text-muted">
          Koble til en mikrofon, eller åpne appen på telefonen over https, og prøv igjen.
        </p>
      )}
      <Button size="lg" onClick={() => void onRetry()}>
        Prøv igjen
      </Button>
    </Card>
  );
}

function ServiceProblem({ problem, onRetry }: { problem: VoiceProblem; onRetry: () => void }) {
  const notSetUp = problem.kind === "not-set-up";
  return (
    <ErrorState
      className="w-full"
      title={notSetUp ? "Resepsjonen er ikke satt opp" : "Fikk ikke kontakt med resepsjonen"}
      body={
        notSetUp
          ? "Agenten er ikke koblet til serveren ennå."
          : "Samtalen ble brutt eller kom aldri i gang. Sjekk nettet og prøv igjen."
      }
      action={
        <Button variant="secondary" onClick={() => void onRetry()}>
          Prøv igjen
        </Button>
      }
    />
  );
}
