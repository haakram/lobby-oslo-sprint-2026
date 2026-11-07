import type { Perk, RoomTypeId } from "./hotel";

export const MESSAGE_TOPICS = ["booking", "question", "complaint", "lost_item", "other"] as const;
export type MessageTopic = (typeof MESSAGE_TOPICS)[number];

/** A booking request waiting for staff (Venter). Nothing is booked until staff call back. */
export type BookingRecord = {
  kind: "booking";
  id: string;
  createdAt: string;
  name: string;
  phone: string;
  arrival: string;
  departure: string;
  guests: number;
  room: RoomTypeId;
  note: string;
  /** Discount step agreed in the call (0 = the normal direct price; see DISCOUNT_STEPS). */
  discountStep: number;
  /** The free extra promised in the call, if any. */
  perk: Perk | null;
  /** Agreed price per night, computed by code from the step: never from what the caller said. */
  pricePerNight: number;
  /** Agreed total for the stay, breakfast included. */
  directTotal: number;
};

/** A message for staff to call back about (Ring tilbake). */
export type MessageRecord = {
  kind: "message";
  id: string;
  createdAt: string;
  name: string;
  phone: string;
  topic: MessageTopic;
  message: string;
  urgent: boolean;
};

export type ReceptionRecord = BookingRecord | MessageRecord;

export const MAX_RECORDS_PER_CALL = 10;

export type ReceptionSink = {
  record(item: ReceptionRecord): "recorded" | "duplicate" | "full";
};

/** What makes two records the same request: every field except id and createdAt. */
function sameRequestKey(item: ReceptionRecord): string {
  const fields = Object.entries(item).filter(([key]) => key !== "id" && key !== "createdAt");
  return JSON.stringify(fields.sort(([a], [b]) => a.localeCompare(b)));
}

/** One sink per call: drops repeats and refuses a flood after MAX_RECORDS_PER_CALL. */
export function createCallSink(onRecord: (item: ReceptionRecord) => void): ReceptionSink {
  const seen = new Set<string>();
  return {
    record(item) {
      const key = sameRequestKey(item);
      if (seen.has(key)) return "duplicate";
      if (seen.size >= MAX_RECORDS_PER_CALL) return "full";
      seen.add(key);
      onRecord(item);
      return "recorded";
    },
  };
}
