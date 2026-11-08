import { cx, Skeleton, Stat } from "@/ui";
import type { DashboardData } from "./data";
import { type Highlight, selectHighlights } from "./highlights";

/** One rule however many figures the role sees (Tailwind needs the class names written out). */
const WIDE_COLUMNS: Record<number, string> = {
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
  6: "xl:grid-cols-6",
};

/**
 * The hotel's good news in figures, read right after the greeting: bookings, occupancy, the night's
 * tasks done out of all, hours the robot saved, rooms ready to sell, the guests' rating (or, for
 * the robot manager, rooms checked and stock). Green where the figure is good, neutral otherwise;
 * nothing here is red or amber (what needs a person is in the bell). A role sees only figures of
 * screens it may open. Bookings, occupancy, rating and stock are test data until the integrations
 * land; the rest comes from the night.
 */
export function KpiStrip({ data }: { data: DashboardData }) {
  const figures = selectHighlights(data);
  return (
    <section aria-label="Hotellet i tall" data-enter>
      <div className={cx("grid grid-cols-2 gap-x-6 gap-y-6 border-y border-line py-6 sm:grid-cols-3 lg:gap-x-8", WIDE_COLUMNS[figures.length])}>
        {figures.map((figure) => (
          <Figure key={figure.id} figure={figure} loading={data.loading} />
        ))}
      </div>
    </section>
  );
}

/** A figure from the night: a skeleton while it loads, a dash when the night isn't there. */
function Figure({ figure, loading }: { figure: Highlight; loading: boolean }) {
  if (figure.value !== null) return <Stat size="lg" label={figure.label} value={figure.value} unit={figure.unit} tone={figure.tone} />;
  if (figure.fromNight && loading) {
    return (
      <div className="flex flex-col gap-1">
        <Skeleton className="h-10 w-20" />
        <span className="text-sm text-muted">{figure.label}</span>
      </div>
    );
  }
  return <Stat size="lg" label={figure.label} value="–" />;
}
