import { Badge, type BadgeTone, Button, Sheet } from "@/ui";
import { hhmm } from "./format";
import {
  humanizeText,
  itemLabel,
  OUTCOME,
  orderTypeLabel,
  type RoomStatus,
  requestKindLabel,
  SOURCE_WORD,
  STATUS_LOOK,
} from "./labels";
import type { RoomNightEntry, RoomView } from "./selectors";

export const STATUS_TONE: Record<RoomStatus, BadgeTone> = {
  klar: "success",
  ma_vaskes: "warning",
  opptatt: "neutral",
  ikke_forstyrr: "warning",
  ukjent: "neutral",
};

/** What the robot saw, said plainly: a knock answered, a sign on the door, a look inside. */
function statusSentence(status: RoomStatus, source: string | null): string {
  if (source === "door_sign") return "Ikke forstyrr-skilt på døra";
  if (source === "knock" && status === "opptatt") return "Banket på, gjesten åpnet";
  if (source === "room_check" && status === "klar") return "Romsjekk: tomt og ryddig";
  if (source === "room_check" && status === "ma_vaskes") return "Romsjekk: rommet må vaskes";
  return `${(source && SOURCE_WORD[source]) || "Status"}: ${STATUS_LOOK[status].word.toLowerCase()}`;
}

/** One room's night from the run log, in a bottom sheet. */
export function RoomSheet({
  open,
  room,
  entries,
  ended,
  onClose,
}: {
  /** The room stays set while the sheet slides out, so its content doesn't blink away. */
  open: boolean;
  room: RoomView | null;
  entries: RoomNightEntry[];
  ended: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open && room !== null} onClose={onClose} title={room ? `Rom ${room.number}` : ""}>
      {room && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[room.status]}>{STATUS_LOOK[room.status].word}</Badge>
            {room.openOrders > 0 && (
              <Badge tone="danger">
                {room.openOrders} {room.openOrders === 1 ? "åpent avvik" : "åpne avvik"}
              </Badge>
            )}
            <span className="text-sm text-muted">
              {room.statusAt ? `Sist sett ${hhmm(room.statusAt)}` : "Ikke sjekket i natt"} · {room.floor}. etasje
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold">Roboten var ikke innom rommet i natt</p>
              <p className="text-base text-muted">Statusen er ukjent til noen har sjekket rommet.</p>
            </div>
          ) : (
            <ol aria-label={`Natten i rom ${room.number}`} className="-mx-1 max-h-[55dvh] overflow-y-auto px-1">
              {entries.map((entry, index) => (
                <li key={index} className="flex gap-4 border-t border-line py-3 first:border-t-0 first:pt-0">
                  <span className="w-12 shrink-0 text-sm whitespace-nowrap text-muted tabular-nums">
                    {hhmm(entry.at)}
                  </span>
                  <EntryBody entry={entry} ended={ended} />
                </li>
              ))}
            </ol>
          )}

          <Button variant="secondary" onClick={onClose} className="self-start">
            Lukk
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function EntryBody({ entry, ended }: { entry: RoomNightEntry; ended: boolean }) {
  switch (entry.kind) {
    case "status":
      return (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-base">{statusSentence(entry.status, entry.source)}</span>
          <Badge tone={STATUS_TONE[entry.status]}>{STATUS_LOOK[entry.status].word}</Badge>
        </div>
      );
    case "task": {
      const { task } = entry;
      const outcome = task.outcome === "running" && ended ? { word: "Ikke ferdig", tone: "neutral" as const } : OUTCOME[task.outcome];
      return (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{requestKindLabel(task.kind)}</span>
            <span className="font-mono text-xs text-muted">{task.request}</span>
            <Badge tone={outcome.tone}>{outcome.word}</Badge>
          </div>
          {task.item && <span className="text-sm text-muted">Med {itemLabel(task.item)}</span>}
        </div>
      );
    }
    case "work_order":
      return (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">Arbeidsordre</span>
            <Badge tone="danger">{orderTypeLabel(entry.order.type)}</Badge>
          </div>
          <span className="text-sm text-muted">{humanizeText(entry.order.text)}</span>
        </div>
      );
  }
}
