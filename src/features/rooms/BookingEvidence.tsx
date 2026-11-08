import { cx } from "@/ui";
import { PILOT_EVIDENCE, PMS_IS_TEST_DATA, TEST_BOOKING_LABEL, TEST_BOOKING_WORD } from "./pms";

/**
 * Once per panel that rests on the booking system (Rom's room check): that the bookings are the team's
 * test data, written after the night to show the join (round 3, domain review), and where a pilot
 * gets the same evidence without the robot opening a booked room, as one signal per room (legal review).
 * Quiet text, never a mono chip on the money row (round 4, design review); the rows carry the small
 * word "testbooking" (`TestBookingWord`).
 */
export function BookingEvidence({ className }: { className?: string }) {
  return (
    <p className={cx("text-xs text-muted", className)}>
      {PMS_IS_TEST_DATA && `${TEST_BOOKING_LABEL}, merket «${TEST_BOOKING_WORD}». `}
      {PILOT_EVIDENCE}
    </p>
  );
}

/** The small word on a row that rests on a test booking, in the text face. */
export function TestBookingWord({ className }: { className?: string }) {
  if (!PMS_IS_TEST_DATA) return null;
  return <span className={cx("text-xs text-muted", className)}>{TEST_BOOKING_WORD}</span>;
}
