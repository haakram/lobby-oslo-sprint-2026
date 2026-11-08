import { cx } from "@/ui";
import { PILOT_EVIDENCE, PMS_IS_TEST_DATA, TEST_BOOKING_LABEL } from "./pms";

/**
 * Under every room-check row that rests on the booking system (209, 210, 213 on the demo night): that
 * the bookings are the team's test data, written after the night to show the join (jury round 3,
 * the Wybe engineer/the Wybe juror), and where a pilot gets the same evidence without the robot opening a booked room
 * (the law juror/the Holio juror). Calm: muted, small, the label in the mono face like an identifier.
 */
export function BookingEvidence({ className }: { className?: string }) {
  return (
    <p className={cx("flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted", className)}>
      {PMS_IS_TEST_DATA && <span className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono">{TEST_BOOKING_LABEL}</span>}
      <span>{PILOT_EVIDENCE}</span>
    </p>
  );
}
