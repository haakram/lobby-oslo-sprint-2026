import Link from "next/link";
import { buttonClasses, cx, RegenIcon, type RegenName, Skeleton } from "@/ui";
import { percent } from "./format";
import { cleaningHref, type OrderView, type RobotView, type RoomView } from "./selectors";
import { batteryLow } from "./TopBar";

/** Work orders where a guest is waiting: a complaint, or the robot's own task failed. */
export function guestWaiting(orders: readonly OrderView[], resolved: ReadonlySet<string>): OrderView[] {
  return orders.filter((order) => !resolved.has(order.id) && (order.type === "gjesteklage" || order.robot === "failed"));
}

/**
 * The action band under the top bar (UX audit, Oversikt 3): what needs a person now, each line with
 * its one action. The screen's primary action, the cleaning route, lives here, above the fold.
 */
export function NowBand({
  rooms,
  orders,
  resolved,
  robot,
  className,
}: {
  rooms: RoomView[] | null;
  orders: OrderView[] | null;
  resolved: ReadonlySet<string>;
  robot: RobotView | null;
  className?: string;
}) {
  if (!rooms || !orders) {
    return (
      <section aria-label="Nå" data-enter className={cx("flex flex-col gap-3", className)}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-3/4" />
      </section>
    );
  }

  const dirty = rooms.filter((room) => room.status === "ma_vaskes");
  const unchecked = rooms.filter((room) => room.status === "ukjent");
  const waiting = guestWaiting(orders, resolved);
  const low = batteryLow(robot);

  return (
    <section aria-labelledby="now-heading" data-enter className={className}>
      <h1 id="now-heading" className="text-2xl font-bold tracking-[-0.02em]">
        Oversikt
      </h1>
      <ul className="mt-3 flex flex-col divide-y divide-line rounded-md bg-surface">
        <Row
          icon="flag"
          tone={dirty.length > 0 ? "warning" : "muted"}
          text={
            dirty.length > 0
              ? `${dirty.length} ${dirty.length === 1 ? "rom må vaskes" : "rom må vaskes"}: ${dirty.map((room) => room.number).join(", ")}`
              : unchecked.length > 0
                ? `Ingen rom må vaskes · ${unchecked.length} rom er ikke sjekket`
                : "Ingen rom må vaskes"
          }
          action={
            dirty.length > 0 ? (
              <Link href={cleaningHref(dirty.map((room) => room.id))} className={buttonClasses("primary")}>
                Lag renholdsrute
              </Link>
            ) : unchecked.length > 0 ? (
              <Link href={cleaningHref(unchecked.map((room) => room.id))} className={buttonClasses("secondary", "sm")}>
                Lag sjekkrunde
              </Link>
            ) : null
          }
        />
        <Row
          icon="alert-triangle"
          tone={waiting.length > 0 ? "danger" : "muted"}
          text={waiting.length > 0 ? `${waiting.length} ${waiting.length === 1 ? "gjest venter" : "gjester venter"} på svar` : "Ingen gjester venter"}
          action={
            waiting.length > 0 ? (
              <a href="#orders-heading" className={buttonClasses("secondary", "sm")}>
                Se arbeidsordrene
              </a>
            ) : null
          }
        />
        {robot && (
          <Row
            icon={low ? "battery-low" : "agent"}
            tone={low ? "warning" : "muted"}
            text={
              low
                ? `Roboten har lavt batteri, ${percent(robot.battery)}${robot.ended ? " · skiftet er over" : ""}`
                : robot.ended
                  ? `Roboten er ferdig for natten · batteri ${percent(robot.battery)}`
                  : `Roboten jobber · batteri ${percent(robot.battery)}`
            }
            action={
              <Link href="/hotell" className={buttonClasses("ghost", "sm")}>
                Vis i 3D-kartet
              </Link>
            }
          />
        )}
      </ul>
    </section>
  );
}

function Row({ icon, tone, text, action }: { icon: RegenName; tone: "warning" | "danger" | "muted"; text: string; action: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <RegenIcon
        name={icon}
        size={20}
        className={cx("shrink-0", tone === "warning" && "text-warning", tone === "danger" && "text-danger", tone === "muted" && "text-muted")}
      />
      <span className={cx("min-w-0 flex-1 text-base", tone === "muted" ? "text-muted" : "font-semibold")}>{text}</span>
      {action}
    </li>
  );
}
