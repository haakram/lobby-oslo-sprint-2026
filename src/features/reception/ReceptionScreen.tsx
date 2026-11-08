"use client";

import { ConversationProvider } from "@elevenlabs/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import type { VoiceProblem } from "@/features/voice/useFetteroVoice";
import { Transcript } from "@/features/voice/Transcript";
import { Button, Card, EmptyState, ErrorState, fadeRise, MicIcon } from "@/ui";
import { CallLogPanel } from "./CallLogPanel";
import { HOTEL, RECEPTIONIST_NAME } from "./hotel";
import { PhoneCall } from "./PhoneCall";
import { RecordCard } from "./RecordCard";
import { RETENTION_DAYS } from "./retention";
import type { BookingRecord, ReceptionRecord } from "./records";
import { useReceptionVoice } from "./useReceptionVoice";
import { useStaffMarks, type StaffMark } from "./useStaffMarks";
import { useStoredRecords } from "./useStoredRecords";

/** /resepsjon: a guest's phone calls the hotel (left); the hotel sees what Maria took down (right). */
export function ReceptionScreen() {
  return (
    <ConversationProvider>
      <ReceptionSession />
    </ConversationProvider>
  );
}

function ReceptionSession() {
  // Everything taken down, newest first, kept across reloads until staff settle it. Ticks live in useStaffMarks.
  const { records, add } = useStoredRecords();
  const { marks, mark } = useStaffMarks();
  // Bookings Maria confirmed and staff did not cancel hold their room, so it is not sold twice.
  const held = useMemo(
    () =>
      records.filter(
        (r): r is BookingRecord => r.kind === "booking" && r.confirmed === true && marks[r.id] !== "avvist",
      ),
    [records, marks],
  );
  const voice = useReceptionVoice(add, held);
  const micProblem = voice.problem?.kind === "mic-denied" || voice.problem?.kind === "no-mic";

  return (
    <main data-surface="light" className="flex-1 bg-bg px-4 pt-6 pb-12 text-text sm:px-6 lg:px-10 lg:pt-10">
      <header>
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl sm:tracking-[-0.03em]">Resepsjon</h1>
        <p className="mt-2 max-w-[60ch] text-base text-muted">
          Ring {HOTEL.name} som en gjest. {RECEPTIONIST_NAME}, hotellets virtuelle assistent, svarer døgnet rundt på
          gjestens språk. Til venstre gjestens telefon, til høyre det resepsjonen ser.
        </p>
      </header>

      <div className="mt-8 grid max-w-6xl gap-8 lg:mt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <section aria-label="Gjestens telefon" className="flex min-w-0 flex-col items-center gap-6">
          <h2 className="text-sm font-semibold tracking-[0.08em] text-muted uppercase">Gjesten ringer</h2>
          <PhoneCall
            phase={voice.phase}
            connected={voice.connected}
            turns={voice.turns}
            onCall={() => void voice.start()}
            onHangUp={voice.stop}
          />
          {voice.problem &&
            (micProblem ? (
              <MicrophoneProblem problem={voice.problem} onRetry={voice.start} />
            ) : (
              <ServiceProblem problem={voice.problem} onRetry={voice.start} />
            ))}
        </section>

        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="live-heading" className="flex flex-col gap-4">
            <h2 id="live-heading" className="text-lg font-bold tracking-[-0.01em]">
              Samtalen nå
            </h2>
            <Card>
              <Transcript
                turns={voice.turns}
                language={voice.language}
                agentLabel={RECEPTIONIST_NAME}
                emptyText={`Trykk på den grønne knappen på telefonen og snakk som en gjest. Det du og ${RECEPTIONIST_NAME} sier, vises her.`}
              />
            </Card>
          </section>
          <section aria-labelledby="records-heading" className="flex flex-col gap-4">
            <h2 id="records-heading" className="text-lg font-bold tracking-[-0.01em]">
              Bookinger og beskjeder
            </h2>
            <Records records={records} marks={marks} onMark={mark} />
            <p className="text-sm text-muted">
              Personvern: bare ansatte ser dette. Beskjeder slettes {RETENTION_DAYS} dager etter samtalen, bookinger{" "}
              {RETENTION_DAYS} dager etter avreise, og samtaleteksten slettes etter {RETENTION_DAYS} dager. Ingen
              lydopptak. Gjesten kan be om innsyn, retting eller sletting på {HOTEL.privacy.email}.
            </p>
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
  onMark: (id: string, value: StaffMark | null) => void;
}) {
  const reduced = useReducedMotion();
  if (records.length === 0) {
    return (
      <Card>
        <EmptyState title="Ingen forespørsler ennå" body="Bookinger og beskjeder resepsjonisten tar imot, venter her til du har svart på dem." />
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
