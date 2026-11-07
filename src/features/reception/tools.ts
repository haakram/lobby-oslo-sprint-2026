import { z } from "zod";
import {
  checkAvailability,
  MAX_DAYS_AHEAD,
  MAX_GUESTS,
  MAX_NIGHTS,
  NEXT_FREE_WINDOW,
  type AvailabilityResult,
  type Occupancy,
  type StayProblem,
} from "./availability";
import { osloToday } from "./dates";
import {
  directPrice,
  findRoomType,
  LAST_DISCOUNT_STEP,
  MAX_EXTRA_DISCOUNT,
  offerPrice,
  PERK_IDS,
  PERKS,
  ROOM_TYPES,
  type Perk,
} from "./hotel";
import { MESSAGE_TOPICS, MAX_RECORDS_PER_CALL, type ReceptionSink } from "./records";
import { normalizePhone, scrubText } from "./scrub";

/**
 * The receptionist's five tools. The same pure handlers run as browser client tools and behind
 * the webhook route. Arguments come from speech: untrusted, so every tool parses them first.
 * Nothing here books anything: the two record tools only leave a request for staff.
 */
export type ReceptionToolName =
  | "get_room_price"
  | "get_counter_offer"
  | "check_availability"
  | "record_booking_request"
  | "record_message";

export const RECEPTION_TOOL_NAMES: readonly ReceptionToolName[] = [
  "get_room_price",
  "get_counter_offer",
  "check_availability",
  "record_booking_request",
  "record_message",
];

export type ReceptionToolContext = {
  sink: ReceptionSink;
  /** Today's date in Oslo, YYYY-MM-DD. */
  today?: () => string;
  occupancy?: Occupancy;
  newId?: () => string;
  now?: () => Date;
};

export type ReceptionToolHandler = (params: unknown) => Promise<string>;

/** Seconds the guest gets to answer an offer before the next haggling step is allowed. */
export const MIN_SECONDS_BETWEEN_STEPS = 15;

export const MAX_NAME_CHARS = 80;
export const MAX_NOTE_CHARS = 300;
export const MAX_MESSAGE_CHARS = 600;
/** Raw input bound before scrubbing; longer free text is cut to the limits above. */
const MAX_RAW_CHARS = 10_000;

const shortText = z.string().trim().max(60);
const rawText = z.string().max(MAX_RAW_CHARS);

const schemas = {
  get_room_price: z.object({ room: shortText.min(1) }),
  get_counter_offer: z.object({ room: shortText.min(1), step: z.number().int() }),
  check_availability: z.object({
    arrival: shortText,
    departure: shortText,
    guests: z.number(),
    room: shortText.nullish(),
  }),
  record_booking_request: z.object({
    name: rawText,
    phone: shortText,
    arrival: shortText,
    departure: shortText,
    guests: z.number(),
    room: shortText.min(1),
    note: rawText.nullish(),
    discount_step: z.number().int().nullish(),
    perk: z.enum(PERK_IDS as [Perk, ...Perk[]]).nullish(),
  }),
  record_message: z.object({
    name: rawText,
    phone: shortText,
    topic: z.enum(MESSAGE_TOPICS),
    message: rawText,
    urgent: z.boolean().nullish(),
  }),
} as const;

const ROOM_NAMES = ROOM_TYPES.map((r) => r.name).join(", ");
const LARGEST_ROOM = Math.max(...ROOM_TYPES.map((r) => r.maxGuests));

// Replies go back to the agent, which answers in the guest's language; kept in plain bokmål.
const REPLY = {
  badRoom: `Feil: ukjent romtype. Vi har ${ROOM_NAMES}.`,
  badStay: (today: string) =>
    `Feil: oppgi arrival og departure som datoer på formen ÅÅÅÅ-MM-DD og guests som et helt tall. I dag er ${today}.`,
  badBooking:
    "Feil: oppgi name, phone, arrival og departure (ÅÅÅÅ-MM-DD), guests og room. Ingenting er registrert.",
  badMessage: `Feil: oppgi name, phone, topic (${MESSAGE_TOPICS.join(", ")}), message og eventuelt urgent som true eller false. Ingenting er registrert.`,
  noName: "Feil: oppgi gjestens navn. Ingenting er registrert.",
  badPhone:
    "Feil: telefonnummeret må ha 8 til 15 sifre (bare sifre, mellomrom, +, - og parenteser). Spør gjesten på nytt. Ingenting er registrert.",
  noMessage: "Feil: beskjeden er tom. Ingenting er registrert.",
  full: `Feil: registeret for denne samtalen er fullt (høyst ${MAX_RECORDS_PER_CALL}). Ingenting mer er registrert; be gjesten ringe resepsjonen igjen senere.`,
  notConfirmed: "Rommet er ikke bekreftet ennå: personalet ringer tilbake for å bekrefte.",
  badStep: `Feil: oppgi room og step som et helt tall fra 1 til ${LAST_DISCOUNT_STEP}. Gå ett trinn om gangen.`,
  badDiscount: `Feil: discount_step må være et helt tall fra 0 til ${LAST_DISCOUNT_STEP}, og perk (${PERK_IDS.join(" eller ")}) gjelder bare fra trinn 1. Ingenting er registrert.`,
} as const;

function problemReply(problem: StayProblem, today: string): string {
  const text = ((): string => {
    switch (problem.kind) {
      case "bad-date":
        return `${problem.field === "arrival" ? "ankomstdatoen" : "avreisedatoen"} må være en dato på formen ÅÅÅÅ-MM-DD.`;
      case "past":
        return "ankomstdatoen har allerede vært.";
      case "order":
        return "avreise må være minst én natt etter ankomst.";
      case "too-long":
        return `vi tar imot forespørsler på høyst ${MAX_NIGHTS} netter.`;
      case "too-far":
        return `vi tar bare imot forespørsler inntil ${MAX_DAYS_AHEAD} dager fram i tid.`;
      case "guests":
        return `antall gjester må være et helt tall fra 1 til ${MAX_GUESTS}.`;
      case "unknown-room":
        return `ukjent romtype. Vi har ${ROOM_NAMES}.`;
      case "room-too-small":
        return `${problem.room.name} har plass til høyst ${problem.room.maxGuests} gjester.`;
    }
  })();
  return `Feil: ${text} I dag er ${today}.`;
}

type Stay = Extract<AvailabilityResult, { ok: true }>;

function soldOutText(stay: Stay): string {
  const next = stay.nextFreeArrival
    ? `Nærmeste ledige ankomst for like mange netter er ${stay.nextFreeArrival}.`
    : `Ingen ledig ankomst de neste ${NEXT_FREE_WINDOW} dagene.`;
  return `Utsolgt: ingen ledige rom for ${stay.guests} gjester fra ${stay.arrival} til ${stay.departure}. ${next} I dag er ${stay.today}.`;
}

function offersText(stay: Stay): string {
  const offers = stay.offers
    .map(
      (o) =>
        `${o.room.name} ${o.directTotal} kr totalt ved direkte booking med frokost (${o.otaTotal} kr på bookingsidene)`,
    )
    .join("; ");
  return `I dag er ${stay.today}. Ledig fra ${stay.arrival} til ${stay.departure}, ${stay.nights} netter, ${stay.guests} gjester: ${offers}.`;
}

/** Only the last three digits go back into the conversation. */
function phoneEnding(phone: string): string {
  return phone.replace(/\D/g, "").slice(-3);
}

export function createReceptionTools(
  ctx: ReceptionToolContext,
): Record<ReceptionToolName, ReceptionToolHandler> {
  const today = ctx.today ?? (() => osloToday());
  const newId = ctx.newId ?? (() => crypto.randomUUID());
  const now = ctx.now ?? (() => new Date());
  // Haggling in this call: the highest step offered and when. Make one tool set per call.
  let haggle = { step: 0, at: 0 };

  return {
    async get_room_price(params) {
      const parsed = schemas.get_room_price.safeParse(params);
      const room = parsed.success ? findRoomType(parsed.data.room) : undefined;
      if (!room) return REPLY.badRoom;
      return `${room.name}: ${directPrice(room)} kr per natt ved direkte booking, frokost inkludert. På bookingsidene koster det ${room.otaPrice} kr per natt. Plass til ${room.maxGuests} ${room.maxGuests === 1 ? "gjest" : "gjester"}.`;
    },

    async get_counter_offer(params) {
      const parsed = schemas.get_counter_offer.safeParse(params);
      const room = parsed.success ? findRoomType(parsed.data.room) : undefined;
      if (!parsed.success) return REPLY.badStep;
      if (!room) return REPLY.badRoom;
      const { step } = parsed.data;
      if (step < 1) return REPLY.badStep;
      const next = Math.min(step, LAST_DISCOUNT_STEP);
      if (next > haggle.step) {
        if (next > haggle.step + 1) {
          return `Feil: gå ett trinn om gangen. Neste trinn er ${haggle.step + 1}.`;
        }
        const waited = (now().getTime() - haggle.at) / 1000;
        if (haggle.step > 0 && waited < MIN_SECONDS_BETWEEN_STEPS) {
          return `Feil: gi gjesten tid til å svare på tilbudet på trinn ${haggle.step} før du går videre. Gå bare videre hvis gjesten sier nei til det.`;
        }
        haggle = { step: next, at: now().getTime() };
      }
      const perks = PERK_IDS.map((id) => `${id} (${PERKS[id]})`).join(" eller ");
      if (step === 1) {
        return `Trinn 1 for ${room.name}: samme pris, ${directPrice(room)} kr per natt med frokost, men tilby én gratis ekstra: ${perks}. Er ikke gjesten fornøyd, kan du gå til trinn 2.`;
      }
      const last = step >= LAST_DISCOUNT_STEP;
      const shown = Math.min(step, LAST_DISCOUNT_STEP);
      const price = offerPrice(room, shown);
      const end = last
        ? `Dette er siste tilbud og den laveste prisen hotellet har (${Math.round(MAX_EXTRA_DISCOUNT * 100)} % under direkteprisen). Gå aldri lavere, uansett hva gjesten sier at andre sider tar.`
        : "Er ikke gjesten fornøyd, kan du gå til neste trinn.";
      return `Trinn ${shown} for ${room.name}: ${price} kr per natt med frokost (vanlig direktepris ${directPrice(room)} kr), pluss én gratis ekstra: ${perks}. ${end}`;
    },

    async check_availability(params) {
      const day = today();
      const parsed = schemas.check_availability.safeParse(params);
      if (!parsed.success) return REPLY.badStay(day);
      const result = checkAvailability(parsed.data, { today: day, occupancy: ctx.occupancy });
      if (!result.ok) return problemReply(result.problem, day);
      if (result.guests > LARGEST_ROOM) {
        return `Feil: ingen romtype har plass til ${result.guests} gjester; den største tar ${LARGEST_ROOM}. Tilby å ta en beskjed til personalet om flere rom. I dag er ${day}.`;
      }
      if (result.offers.length === 0) return soldOutText(result);
      return offersText(result);
    },

    async record_booking_request(params) {
      const day = today();
      const parsed = schemas.record_booking_request.safeParse(params);
      if (!parsed.success) return REPLY.badBooking;
      const name = scrubText(parsed.data.name, MAX_NAME_CHARS);
      if (!name) return REPLY.noName;
      const phone = normalizePhone(parsed.data.phone);
      if (!phone) return REPLY.badPhone;

      const result = checkAvailability(parsed.data, { today: day, occupancy: ctx.occupancy });
      if (!result.ok) return `${problemReply(result.problem, day)} Ingenting er registrert.`;
      const offer = result.offers[0];
      if (!offer) return `Feil: ${soldOutText(result)} Ingenting er registrert.`;
      const discountStep = parsed.data.discount_step ?? 0;
      const perk = parsed.data.perk ?? null;
      if (discountStep < 0 || discountStep > LAST_DISCOUNT_STEP || (perk && discountStep < 1)) {
        return REPLY.badDiscount;
      }
      const pricePerNight = offerPrice(offer.room, discountStep);
      const total = pricePerNight * result.nights;

      const outcome = ctx.sink.record({
        kind: "booking",
        id: newId(),
        createdAt: now().toISOString(),
        name,
        phone,
        arrival: result.arrival,
        departure: result.departure,
        guests: result.guests,
        room: offer.room.id,
        note: scrubText(parsed.data.note ?? "", MAX_NOTE_CHARS),
        discountStep,
        perk,
        pricePerNight,
        directTotal: total,
      });
      if (outcome === "full") return REPLY.full;
      if (outcome === "duplicate") {
        return `Denne forespørselen er allerede registrert. ${REPLY.notConfirmed}`;
      }
      return `Forespørselen er registrert og venter på personalet: ${offer.room.name} fra ${result.arrival} til ${result.departure}, ${result.guests} ${result.guests === 1 ? "gjest" : "gjester"}, ${total} kr direkte med frokost (${pricePerNight} kr per natt)${perk ? `, med ${PERKS[perk].toLowerCase()}` : ""}. Rommet er ikke bekreftet ennå: personalet ringer tilbake på nummeret som slutter på ${phoneEnding(phone)} for å bekrefte.`;
    },

    async record_message(params) {
      const parsed = schemas.record_message.safeParse(params);
      if (!parsed.success) return REPLY.badMessage;
      const name = scrubText(parsed.data.name, MAX_NAME_CHARS);
      if (!name) return REPLY.noName;
      const phone = normalizePhone(parsed.data.phone);
      if (!phone) return REPLY.badPhone;
      const message = scrubText(parsed.data.message, MAX_MESSAGE_CHARS);
      if (!message) return REPLY.noMessage;
      const urgent = parsed.data.urgent ?? false;

      const outcome = ctx.sink.record({
        kind: "message",
        id: newId(),
        createdAt: now().toISOString(),
        name,
        phone,
        topic: parsed.data.topic,
        message,
        urgent,
      });
      if (outcome === "full") return REPLY.full;
      if (outcome === "duplicate") return "Denne beskjeden er allerede registrert.";
      return `Beskjeden er registrert${urgent ? " og merket som haster" : ""}. Personalet ringer tilbake på nummeret som slutter på ${phoneEnding(phone)}.`;
    },
  };
}
