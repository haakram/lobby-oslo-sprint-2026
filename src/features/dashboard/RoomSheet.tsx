import Link from "next/link";
import { canAccess, useSession } from "@/features/auth";
import { Badge, type BadgeTone, buttonClasses, Sheet } from "@/ui";
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
import { cleaningHref, type RoomNightEntry, type RoomView } from "./selectors";

export const STATUS_TONE: Record<RoomStatus, BadgeTone> = {
  klar: "success",
  ma_vaskes: "warning",
  opptatt: "neutral",
  // A door hanger, not a job: amber is for what needs someone (DESIGN.md "Room states").
  ikke_forstyrr: "neutral",
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
  dirtyIds = [],
  onClose,
}: {
  /** The room stays set while the sheet slides out, so its content doesn't blink away. */
  open: boolean;
  room: RoomView | null;
  entries: RoomNightEntry[];
  ended: boolean;
  /** Tonight's rooms that must be cleaned: "Legg i renholdsrute" adds this room to them. */
  dirtyIds?: readonly string[];
  onClose: () => void;
}) {
  // The 3D-kart is the robot manager's: a receptionist would land on "Ingen tilgang", so the link is not shown.
  const { effectiveRole } = useSession();
  const map3d = effectiveRole === null || canAccess(effectiveRole, "/hotell");
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

          {/* The room's actions sit with its status, above the night's log, so a long night never buries them. */}
          <div className="flex flex-wrap gap-2">
            <Link href={cleaningHref([...new Set([...dirtyIds, room.id])])} className={buttonClasses("secondary")}>
              Legg i renholdsrute
            </Link>
            {map3d && (
              <Link href={`/hotell?rom=${encodeURIComponent(room.id)}`} className={buttonClasses("secondary")}>
                Vis i 3D-kartet
              </Link>
            )}
          </div>

          {entries.length === 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold">Roboten var ikke innom rommet i natt</p>
              <p className="text-base text-muted">Statusen er ukjent til noen har sjekket rommet.</p>
            </div>
          ) : (
            <ol aria-label={`Natten i rom ${room.number}`}>
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
