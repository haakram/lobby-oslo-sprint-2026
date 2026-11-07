import Link from "next/link";
import { Badge, buttonClasses, Card, cx, EmptyState, Skeleton } from "@/ui";
import { cleaningHref, type RoomView } from "./selectors";

/**
 * Renhold: the rooms the robot's checks marked "må vaskes", and the screen's one primary action,
 * Send renholderne, which hands them to Ruter for the shortest round across floors.
 */
export function Cleaning({ rooms, className }: { rooms: RoomView[] | null; className?: string }) {
  const dirty = rooms?.filter((room) => room.status === "ma_vaskes") ?? [];
  const unchecked = rooms?.filter((room) => room.status === "ukjent") ?? [];

  return (
    <section aria-labelledby="cleaning-heading" data-enter className={className}>
      <Card className="sm:p-6">
        <h2 id="cleaning-heading" className="text-lg font-semibold tracking-[-0.01em]">
          Renhold
        </h2>

        {!rooms ? (
          <div className="mt-4 flex flex-col gap-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : dirty.length === 0 ? (
          <EmptyState
            className="mt-3"
            title="Ingen rom må vaskes"
            body={
              unchecked.length > 0
                ? `Romsjekkene i natt fant ingen rom som må vaskes. ${unchecked.length} rom er ikke sjekket.`
                : "Romsjekkene i natt fant ingen rom som må vaskes."
            }
            action={
              unchecked.length > 0 && (
                <Link href={cleaningHref(unchecked.map((room) => room.id))} className={buttonClasses("secondary")}>
                  Lag sjekkrunde for {unchecked.length} rom
                </Link>
              )
            }
          />
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            <p className="text-base">
              <span className="font-display text-2xl font-medium tabular-nums">{dirty.length}</span>{" "}
              rom må vaskes
            </p>
            <ul aria-label="Rom som må vaskes" className="flex flex-wrap gap-2">
              {dirty.map((room) => (
                <li key={room.id}>
                  <Badge tone="warning">Rom {room.number}</Badge>
                </li>
              ))}
            </ul>
            <div>
              <Link
                href={cleaningHref(dirty.map((room) => room.id))}
                className={cx(buttonClasses("primary", "lg"), "w-full active:scale-[0.97]")}
              >
                Send renholderne
              </Link>
              <p className="mt-2 text-sm text-muted">Ruter finner korteste runde på tvers av etasjene.</p>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
