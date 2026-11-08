"use client";

import { PanelHead } from "@/features/modules/ModulePage";
import { Badge, Button, Card, RegenIcon, Stat } from "@/ui";
import { agoClock, APARTMENTS, AUTO_TOPICS, LANG_NAME, type Thread } from "./demoData";
import { HostFigures, HostPage } from "./HostPage";
import { type HostReady, useHost } from "./HostProvider";

export const MESSAGE_FIGURES = ["Meldinger siste døgn", "Svart automatisk", "Svartid i snitt", "Oversatt til norsk"];

/**
 * Gjestemeldinger: every guest message in Norwegian, whatever language it came in, and what went back.
 * The common questions (code, wifi, parking, check-out) are answered by the auto-replies; the one that
 * needs the host is on top, with Fettero's suggestion and the answer one tap away.
 *
 * TODO(phase-3): the inbox and the replies go through the channel's messaging API (Airbnb / Booking.com);
 * translation through the same model as the voice module.
 */
export function HostMessages() {
  const host = useHost();
  return (
    <HostPage
      module="vert-meldinger"
      lede="Fettero svarer på det vanlige selv og oversetter alt til norsk. Det som trenger deg, ligger øverst."
      figureLabels={MESSAGE_FIGURES}
    >
      {host.kind === "ready" && <Messages host={host} />}
    </HostPage>
  );
}

function Messages({ host }: { host: HostReady }) {
  const { day } = host;
  const auto = day.threads.filter((thread) => thread.reply.kind === "auto");
  const translated = day.threads.filter((thread) => thread.lang !== "nb");
  const languages = new Set(translated.map((thread) => thread.lang)).size;
  const answerTime = auto.length ? Math.max(1, Math.round(auto.reduce((sum, thread) => sum + (thread.reply.kind === "auto" ? thread.reply.minutesAfter : 0), 0) / auto.length)) : 0;
  const open = (thread: Thread) => thread.reply.kind === "waiting" && host.lateCheckout === null;
  const threads = [...day.threads].sort((a, b) => Number(open(b)) - Number(open(a)) || a.minutesAgo - b.minutesAgo);

  return (
    <>
      <HostFigures label="Meldingene i tall">
        <Stat label="Meldinger siste døgn" value={day.threads.length} />
        <Stat label="Svart automatisk" value={auto.length} unit={`av ${day.threads.length}`} tone="success" />
        <Stat label="Svartid i snitt" value={answerTime} unit="min" tone="success" />
        <Stat label="Oversatt til norsk" value={translated.length} unit={`fra ${languages} språk`} />
      </HostFigures>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-8">
        <section aria-labelledby="innboks-heading" data-enter className="min-w-0">
          <Card className="sm:p-6">
            <PanelHead id="innboks-heading" title="Innboksen" count={threads.length} note="Nyeste først. Det som venter på deg, øverst." />
            <ul className="mt-2 divide-y divide-line">
              {threads.map((thread) => (
                <ThreadRow key={thread.id} thread={thread} host={host} />
              ))}
            </ul>
          </Card>
        </section>

        <section aria-labelledby="autosvar-heading" data-enter className="min-w-0">
          <Card className="sm:p-6">
            <PanelHead id="autosvar-heading" title="Autosvar som er på" count={AUTO_TOPICS.length} />
            <p className="text-sm text-muted">Sendes på gjestens eget språk, med boligens egen info.</p>
            <ul className="mt-2 divide-y divide-line">
              {AUTO_TOPICS.map((topic) => (
                <li key={topic.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-0.5 py-3">
                  <span className="font-semibold">{topic.name}</span>
                  <Badge tone="success" className="justify-self-end">
                    På
                  </Badge>
                  <span className="text-sm text-muted">{topic.when}</span>
                  <span className="text-sm whitespace-nowrap text-muted tabular-nums">
                    {Math.round(topic.perStay * day.month.staysSoFar)} i {day.month.month}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>
    </>
  );
}

function ThreadRow({ thread, host }: { thread: Thread; host: HostReady }) {
  const { day } = host;
  const apartment = APARTMENTS.find((entry) => entry.id === thread.apartment)!;
  const language = LANG_NAME[thread.lang];
  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0">
          <span className="font-semibold">{thread.guest}</span>
          <span className="text-sm text-muted"> · {apartment.name}</span>
        </p>
        <span className="text-sm whitespace-nowrap text-muted tabular-nums">{agoClock(thread.minutesAgo, day.minute)}</span>
      </div>
      <p className="text-base">{thread.text}</p>
      {thread.lang !== "nb" && (
        <details className="text-sm">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-muted pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
            Oversatt fra {language} ·<span className="font-semibold text-accent-text">Vis originalen</span>
            <RegenIcon name="chevron-down" size={16} className="text-accent-text" />
          </summary>
          <p lang={thread.lang} className="border-l-2 border-line pl-3 text-muted">
            {thread.original}
          </p>
        </details>
      )}
      {thread.reply.kind === "auto" ? (
        <div className="rounded-md bg-sunken p-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <RegenIcon name="circle-check" size={14} className="text-success" />
            <span className="font-semibold text-success">Svart automatisk</span>
            <span className="tabular-nums">
              {agoClock(thread.minutesAgo - thread.reply.minutesAfter, day.minute)} · {AUTO_TOPICS.find((topic) => topic.id === (thread.reply.kind === "auto" ? thread.reply.topic : ""))?.name}
              {thread.lang !== "nb" && ` · sendt på ${language}`}
            </span>
          </p>
          <p className="mt-1 text-sm">{thread.reply.text}</p>
        </div>
      ) : host.lateCheckout === null ? (
        <div className="flex flex-col gap-3 rounded-md border border-line p-3">
          <p className="flex items-start gap-2 text-sm">
            <RegenIcon name="sparkle" size={16} className="mt-0.5 shrink-0 text-muted" />
            {thread.reply.suggestion}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => host.answerLateCheckout("accepted")}>Si ja til 13:00</Button>
            <Button variant="secondary" onClick={() => host.answerLateCheckout("declined")}>
              Svar nei, vennlig
            </Button>
          </div>
        </div>
      ) : (
        <div role="status" className="rounded-md bg-success-soft p-3">
          <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-success">
            <RegenIcon name="circle-check" size={14} />
            Du svarte nå nettopp{thread.lang !== "nb" && ` · sendt på ${language}`}
          </p>
          <p className="mt-1 text-sm">{host.lateCheckout === "accepted" ? thread.reply.accept : thread.reply.decline}</p>
        </div>
      )}
    </li>
  );
}
