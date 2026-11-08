"use client";

import { useState } from "react";
import { PanelHead } from "@/features/modules/ModulePage";
import { addDays, daysBetween } from "@/features/reception/dates";
import { Badge, Button, Card, cx, Stat } from "@/ui";
import { APARTMENTS, dayWord, firstName, type HostDay, kr, percent, type Stay } from "./demoData";
import { HostFigures, HostPage } from "./HostPage";
import { useHost } from "./HostProvider";

export const BOOKING_FIGURES = ["Booket for november", "Belegg i november", "Bookinger i november", "Snittpris per natt"];

const WINDOW = 14;
/** Arrivals shown before "Vis alle": about a week's worth, so the month below stays in reach on a phone. */
const ARRIVALS_SHOWN = 8;
const WEEKDAY = new Intl.DateTimeFormat("nb-NO", { weekday: "short", timeZone: "UTC" });
const DAY_NUMBER = new Intl.DateTimeFormat("nb-NO", { day: "numeric", timeZone: "UTC" });
const at = (date: string) => new Date(`${date}T12:00:00Z`);

/**
 * Bookinger og inntekt: the next 14 nights per apartment, who arrives when and what it pays, and the
 * month per apartment. Good news first: what is booked, how full it is.
 */
export function HostBookings() {
  const host = useHost();
  const month = host.kind === "ready" ? host.day.month.month : "november";
  return (
    <HostPage module="vert-bookinger" lede={`De neste 14 nettene, og ${month} så langt.`} figureLabels={BOOKING_FIGURES}>
      {host.kind === "ready" && <Bookings day={host.day} />}
    </HostPage>
  );
}

function Bookings({ day }: { day: HostDay }) {
  const { month } = day;
  const [all, setAll] = useState(false);
  const arrivals = [...day.arrivals].sort((a, b) => a.from.localeCompare(b.from) || a.apartment.localeCompare(b.apartment));
  return (
    <>
      <HostFigures label="Bookingene i tall">
        <Stat label={`Booket for ${month.month}`} value={kr(month.booked)} unit="kr" tone="success" />
        <Stat label={`Belegg i ${month.month}`} value={percent(month.occupancy)} tone="success" />
        <Stat label={`Bookinger i ${month.month}`} value={month.bookings} />
        <Stat label="Snittpris per natt" value={kr(month.averageNightly)} unit="kr" />
      </HostFigures>

      <section aria-labelledby="kalender-heading" data-enter>
        <Card className="sm:p-6">
          <Calendar day={day} />
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-8">
        <section aria-labelledby="ankomster-heading" data-enter className="min-w-0">
          <Card className="sm:p-6">
            <PanelHead id="ankomster-heading" title="Ankomster" count={arrivals.length} note="De neste 14 dagene" />
            <ul className="mt-2 divide-y divide-line">
              {(all ? arrivals : arrivals.slice(0, ARRIVALS_SHOWN)).map((stay) => (
                <ArrivalRow key={stay.id} stay={stay} today={day.today} />
              ))}
            </ul>
            {!all && arrivals.length > ARRIVALS_SHOWN && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll(true)}>
                Vis alle {arrivals.length}
              </Button>
            )}
          </Card>
        </section>

        <section aria-labelledby="perbolig-heading" data-enter className="min-w-0">
          <Card className="sm:p-6">
            <PanelHead id="perbolig-heading" title={`Per bolig i ${month.month}`} />
            <ul className="mt-2 divide-y divide-line">
              {month.perApartment.map((entry) => (
                <li key={entry.apartment.id} className="flex flex-col gap-1.5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold">{entry.apartment.name}</span>
                    <Amount value={entry.booked} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                      <div className="h-full rounded-full bg-success" style={{ width: `${Math.round(entry.occupancy * 100)}%` }} />
                    </div>
                    <span className="w-12 text-right text-sm font-semibold whitespace-nowrap text-success tabular-nums">{percent(entry.occupancy)}</span>
                  </div>
                  <p className="text-xs text-muted tabular-nums">
                    {entry.nights} netter booket · {kr(entry.apartment.nightly)} kr natta
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
              Hittil i {month.month}: <span className="font-mono whitespace-nowrap text-text tabular-nums">{kr(month.earned)}</span> kr. Resten kommer når gjestene har bodd.
            </p>
          </Card>
        </section>
      </div>
    </>
  );
}

function Calendar({ day }: { day: HostDay }) {
  const days = Array.from({ length: WINDOW }, (_, index) => addDays(day.today, index));
  const free = APARTMENTS.reduce(
    (sum, apartment) => sum + days.filter((date) => !day.calendar.some((stay) => stay.apartment === apartment.id && stay.from <= date && stay.to > date)).length,
    0,
  );
  return (
    <>
      <PanelHead id="kalender-heading" title="De neste 14 nettene" note={`${free} ledige netter av ${WINDOW * APARTMENTS.length}`} />
      <div className="mt-4 flex flex-col gap-3">
        {/* The day numbers; each bar says its own dates to a screen reader. */}
        <div aria-hidden="true" className="sm:grid sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-x-4">
          <span className="hidden text-xs text-muted sm:block">Bolig</span>
          <div className="grid grid-cols-14 gap-x-0.5">
            {days.map((date, index) => (
              <span key={date} className={cx("flex flex-col items-center text-xs leading-4", index === 0 ? "font-semibold text-text" : "text-muted")}>
                <span className="hidden md:inline">{WEEKDAY.format(at(date)).replace(".", "")}</span>
                <span className="md:hidden">{WEEKDAY.format(at(date)).charAt(0)}</span>
                <span className="font-mono tabular-nums">{DAY_NUMBER.format(at(date)).replace(".", "")}</span>
              </span>
            ))}
          </div>
        </div>
        <ul aria-label="Bookinger per bolig de neste 14 nettene" className="flex flex-col gap-3">
        {APARTMENTS.map((apartment) => {
          const stays = day.calendar.filter((stay) => stay.apartment === apartment.id);
          return (
            <li key={apartment.id} className="flex flex-col gap-1 sm:grid sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-x-4">
              <span className="truncate text-sm font-semibold">{apartment.name}</span>
              <div className="grid grid-cols-14 gap-x-0.5">
                {days.map((date, index) => (
                  <span key={date} aria-hidden="true" className={cx("h-9 rounded-sm bg-sunken", index === 0 && "ring-1 ring-line-strong ring-inset")} style={{ gridColumn: index + 1, gridRow: 1 }} />
                ))}
                {stays.map((stay) => (
                  <StayBar key={stay.id} stay={stay} today={day.today} />
                ))}
              </div>
            </li>
          );
        })}
        </ul>
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-5 rounded-sm bg-success-soft ring-1 ring-success ring-inset" />
          Booket, med gjestens fornavn
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-5 rounded-sm bg-sunken" />
          Ledig
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-5 rounded-sm ring-1 ring-line-strong ring-inset" />I natt
        </span>
      </p>
    </>
  );
}

function StayBar({ stay, today }: { stay: Stay; today: string }) {
  const start = Math.max(0, daysBetween(today, stay.from));
  const end = Math.min(WINDOW, daysBetween(today, stay.to));
  if (end <= start) return null;
  const before = stay.from < today;
  const after = daysBetween(today, stay.to) > WINDOW;
  const nights = daysBetween(stay.from, stay.to);
  return (
    <span
      title={`${stay.guest}, ${nights} netter`}
      style={{ gridColumn: `${start + 1} / ${end + 1}`, gridRow: 1 }}
      className={cx(
        "z-[1] flex h-9 min-w-0 items-center overflow-hidden rounded-sm bg-success-soft px-1.5 text-xs font-semibold text-success ring-1 ring-success/30 ring-inset",
        before && "rounded-l-none",
        after && "rounded-r-none",
      )}
    >
      <span className="truncate">{firstName(stay.guest)}</span>
      <span className="sr-only">
        , {dayWord(today, stay.from)} til {dayWord(today, stay.to)}
      </span>
    </span>
  );
}

/** An amount in kroner: the figure in the mono face, "kr" small in the text face. */
function Amount({ value }: { value: number }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono text-sm tabular-nums">{kr(value)}</span>
      <span className="ml-1 text-xs text-muted">kr</span>
    </span>
  );
}

function ArrivalRow({ stay, today }: { stay: Stay; today: string }) {
  const apartment = APARTMENTS.find((entry) => entry.id === stay.apartment)!;
  const nights = daysBetween(stay.from, stay.to);
  const when = dayWord(today, stay.from);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 py-3">
      <p className="min-w-0">
        <span className="font-semibold">{stay.guest}</span>
        <span className="text-sm text-muted">
          {" "}
          · {stay.guests} {stay.guests === 1 ? "gjest" : "gjester"}
        </span>
      </p>
      <span className="text-right">
        <Amount value={stay.payout} />
      </span>
      <p className="min-w-0 text-sm text-muted">
        <span className={cx("whitespace-nowrap", when === "i dag" && "font-semibold text-text")}>{when.charAt(0).toLocaleUpperCase("nb-NO") + when.slice(1)}</span> · {apartment.name} ·{" "}
        <span className="whitespace-nowrap">
          {nights} {nights === 1 ? "natt" : "netter"}
        </span>
      </p>
      <span className="justify-self-end">
        <Badge>{stay.channel}</Badge>
      </span>
    </li>
  );
}
