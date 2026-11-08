import Link from "next/link";
import { canAccess } from "@/features/auth/roles";
import { openWetFloors } from "@/features/handover/safety";
import { buttonClasses, RegenIcon, Skeleton } from "@/ui";
import type { DashboardData } from "./data";
import { daySummary, greeting, nightFacts, nightTotals, nightVerdict, shiftHour } from "./highlights";
import { cleaningHref, DAY_ROUND } from "./selectors";

/**
 * The top of Oversikt: a greeting by the shift clock of the night on screen (on stage at 14:15 the
 * recorded night still ends at 06:00, so it says "God morgen"), one factual line on the night (green
 * only for what is done; what needs a person is named, calmly: jury round 2 found a green "Natten gikk
 * fint." beside three unsigned wet floors and a stranger at seven doors), and the screen's one primary
 * action: *Se overleveringen 06:00*, the product's front door (jury round 2, the product juror), with the cleaning
 * route beside it as a secondary action.
 */
export function Greeting({ data }: { data: DashboardData }) {
  const totals = nightTotals(data);
  const verdict = nightVerdict(data, totals);
  const rooms = canAccess(data.role, "/rom") ? data.rooms : null;
  const dirty = rooms?.filter((room) => room.status === "ma_vaskes") ?? [];
  const unchecked = rooms?.filter((room) => room.status === "ukjent") ?? [];
  const handover = canAccess(data.role, "/overlevering");

  // The night's facts once it is in; while it loads, fails or runs, the plain verdict says so.
  const lost = new Set(data.maintenance.filter((order) => order.status === "lost").map((order) => order.id));
  const facts =
    totals && data.safety && data.robot?.ended !== false && data.nightStatus === "ready"
      ? nightFacts({ confirmed: totals.done, wetFloors: openWetFloors(data.safety.wetFloors, (id) => lost.has(id)).length, stranger: data.safety.stranger !== null })
      : null;
  const staff = totals && totals.staffDone > 0 ? `Nattevakten ordnet ${totals.staffDone} til.` : null;
  const day = daySummary(data);
  const rest = [staff, day].filter(Boolean).join(" ");

  const cleaning =
    dirty.length > 0 ? (
      // Ruter opens on Dagens renhold: the night's dirty rooms and today's departures, with the saving.
      <Link href={DAY_ROUND} className={buttonClasses(handover ? "secondary" : "primary")}>
        Lag renholdsrute
      </Link>
    ) : unchecked.length > 0 ? (
      <Link href={cleaningHref(unchecked.map((room) => room.id))} className={buttonClasses("secondary")}>
        Lag sjekkrunde for {unchecked.length} rom
      </Link>
    ) : null;

  return (
    <section aria-labelledby="greeting-heading" data-enter className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
      <div className="min-w-0">
        <h1 id="greeting-heading" className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl sm:tracking-[-0.03em]">
          {greeting(shiftHour(data.night) ?? data.hour, data.userName)}
        </h1>
        {data.loading ? (
          <Skeleton className="mt-3 h-6 w-full max-w-md" />
        ) : facts ? (
          <p className="mt-2 max-w-[64ch] text-base text-muted sm:text-lg">
            <span className="font-semibold text-success">
              <RegenIcon name="circle-check" size={20} strokeWidth={2} className="mr-1.5 inline-block align-[-0.2em]" />
              {facts.done}
            </span>
            {facts.attention && <span className="font-semibold text-text"> · {facts.attention}.</span>}
            {rest && ` ${rest}`}
          </p>
        ) : (
          <p className="mt-2 max-w-[64ch] text-base text-muted sm:text-lg">
            <span className={verdict.good ? "font-semibold text-success" : "font-semibold text-text"}>
              {verdict.good && <RegenIcon name="circle-check" size={20} strokeWidth={2} className="mr-1.5 inline-block align-[-0.2em]" />}
              {verdict.text}
            </span>
            {totals && ` Roboten fullførte ${totals.done} av ${totals.total} oppdrag.`}
            {rest && ` ${rest}`}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {cleaning}
        {handover && (
          <Link href="/overlevering" className={buttonClasses("primary")}>
            Se overleveringen 06:00
          </Link>
        )}
      </div>
    </section>
  );
}
