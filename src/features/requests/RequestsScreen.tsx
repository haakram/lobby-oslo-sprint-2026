"use client";

import { useMemo, useState } from "react";
import { placeLabel } from "@/features/dashboard/labels";
import { useNight } from "@/features/dashboard/useNight";
import { useOrderStatuses } from "@/features/dashboard/useOrderStatuses";
import { useReceptionCalls } from "@/features/dashboard/useReceptionCalls";
import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { SourceNote } from "@/features/modules/SourceNote";
import { Badge, Button, Card, cx, EmptyState, Skeleton, Stat } from "@/ui";
import { countRequests, REQUEST_ORDER, REQUEST_STATUS, type RequestSource, type RequestStatus, type RequestView, selectRequests, SOURCE_WORD } from "./select";

const DONE_SHOWN = 8;
const SOURCES: readonly RequestSource[] = ["telefon", "stemme", "personale", "robot"];

const GROUP_TITLE: Record<RequestStatus, string> = {
  venter: "Venter på noen",
  feilet: "Roboten fikk det ikke til",
  pagar: "Pågår",
  fullfort: "Fullført",
};

/**
 * Forespørsler: everything guests asked for, from every source, with who has it and how it went.
 * Waiting first. Staff move the phone, voice and staff requests along; the robot reports its own.
 */
export function RequestsScreen({ viewerUrl }: { viewerUrl?: string }) {
  const { statusOf, advance, undo } = useOrderStatuses();
  const { run, night } = useNight(viewerUrl);
  const { state: calls } = useReceptionCalls();
  const [source, setSource] = useState<RequestSource | null>(null);
  const [allDone, setAllDone] = useState(false);

  const requests = useMemo(
    () => selectRequests({ night, calls: calls.kind === "ready" ? calls.calls : null, statusOf }),
    [night, calls, statusOf],
  );
  const counts = countRequests(requests);
  const shown = source ? requests.filter((request) => request.source === source) : requests;
  const loading = run.status === "loading" || calls.kind === "loading";

  return (
    <ModulePage module="foresporsler" ready={!loading} lede="Alt gjestene ber om, fra telefon, robot, personale og stemme. Det som venter på noen står først.">
      <FigureRow label="Forespørslene i tall">
        <Stat label="Venter" value={counts.venter} tone={counts.venter > 0 ? "warning" : "default"} />
        <Stat label="Pågår" value={counts.pagar} />
        <Stat label="Fullført" value={counts.fullfort} tone="success" />
        <Stat label="Feilet" value={counts.feilet} tone={counts.feilet > 0 ? "danger" : "default"} />
      </FigureRow>

      <section aria-labelledby="requests-heading" data-enter>
        <Card className="sm:p-6">
          <PanelHead
            id="requests-heading"
            title="Forespørsler"
            count={shown.length}
            action={
              <div role="group" aria-label="Kilde" className="flex flex-wrap gap-1">
                <Chip pressed={source === null} onClick={() => setSource(null)}>
                  Alle
                </Chip>
                {SOURCES.map((id) => (
                  <Chip key={id} pressed={source === id} onClick={() => setSource(id)}>
                    {SOURCE_WORD[id]}
                  </Chip>
                ))}
              </div>
            }
          />

          {loading && requests.length === 0 ? (
            <div className="mt-4 flex flex-col gap-4" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <EmptyState className="mt-4" title="Ingen forespørsler" body={source ? `Ingen fra ${SOURCE_WORD[source].toLowerCase()} i dag.` : "Når gjester ber om noe, står det her med kilde, rom og hvem som har saken."} />
          ) : (
            REQUEST_ORDER.map((status) => {
              const group = shown.filter((request) => request.status === status);
              if (group.length === 0) return null;
              const limited = status === "fullfort" && !allDone ? group.slice(0, DONE_SHOWN) : group;
              return (
                <div key={status} className="mt-5 first:mt-3">
                  <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                    {GROUP_TITLE[status]}
                    <span className="font-normal text-muted tabular-nums">{group.length}</span>
                  </h3>
                  <ol className="mt-1 divide-y divide-line">
                    {limited.map((request) => (
                      <Row key={request.id} request={request} onAdvance={advance} onUndo={undo} />
                    ))}
                  </ol>
                  {status === "fullfort" && group.length > DONE_SHOWN && (
                    <Button variant="ghost" size="sm" className="-ml-3 mt-1" onClick={() => setAllDone((value) => !value)} aria-expanded={allDone}>
                      {allDone ? "Vis færre" : `Vis alle ${group.length}`}
                    </Button>
                  )}
                </div>
              );
            })
          )}
          <SourceNote className="mt-4" sources={["run-log", "reception", "test", "local"]} />
        </Card>
      </section>
    </ModulePage>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        "min-h-9 rounded-md px-3 text-sm font-medium transition-colors duration-[120ms] ease-standard pointer-coarse:min-h-11",
        pressed ? "bg-text text-bg" : "bg-sunken text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function Row({ request, onAdvance, onUndo }: { request: RequestView; onAdvance: (id: string) => void; onUndo: (id: string) => void }) {
  const look = REQUEST_STATUS[request.status];
  const where = request.room ? placeLabel(request.room) : null;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm whitespace-nowrap text-muted tabular-nums">
            {request.at ?? "–"}
            {request.tonight && <span className="ml-1 text-xs">i natt</span>}
          </span>
          <span className="font-semibold">{request.kind}</span>
          {where && <span className="text-sm text-muted">{where}</span>}
          <Badge tone="neutral">{SOURCE_WORD[request.source]}</Badge>
        </div>
        {request.text && (
          <p lang={request.lang ?? undefined} className={cx("text-sm", request.lang === "en" ? "text-muted" : "text-text")}>
            {request.lang === "en" ? `«${request.text}»` : request.text}
          </p>
        )}
        <p className="text-sm text-muted">{request.handler}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:w-56 sm:justify-end">
        <Badge tone={look.tone}>{look.word}</Badge>
        {request.actionable &&
          (request.status === "fullfort" ? (
            <Button variant="ghost" size="sm" onClick={() => onUndo(request.id)} aria-label={`Angre fullført: ${request.kind}`}>
              Angre
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => onAdvance(request.id)} aria-label={`${request.status === "venter" ? "Ta saken" : "Marker fullført"}: ${request.kind}`}>
              {request.status === "venter" ? "Ta saken" : "Marker fullført"}
            </Button>
          ))}
      </div>
    </li>
  );
}
