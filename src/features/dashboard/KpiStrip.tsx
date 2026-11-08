import { cx, Figure as Digits, Skeleton, Stat } from "@/ui";
import type { DashboardData } from "./data";
import { figureSources, type Highlight, selectHighlights } from "./highlights";

/**
 * One rule however many figures the role sees, and never a figure left alone on a second line (design
 * review, round 5: four figures wrapped 3 + 1 at 1152 px, "19 av 36" on its own). Columns follow the
 * row's own width (a container query), not the window's, so the rail beside it can't break the count:
 * four figures are 2 + 2 or one rule of 4, six are 3 + 3 or 6. Tailwind needs the class names written out.
 */
export const COLUMNS: Readonly<Record<number, string>> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 @min-[36rem]:grid-cols-3",
  4: "grid-cols-2 @min-[44rem]:grid-cols-4",
  5: "grid-cols-2 @min-[36rem]:grid-cols-3 @min-[60rem]:grid-cols-5",
  6: "grid-cols-2 @min-[36rem]:grid-cols-3 @min-[66rem]:grid-cols-6",
};

/**
 * The hotel's good news in figures, read right after the greeting: bookings, occupancy, the night's
 * tasks done out of all, hours the robot saved, rooms ready to sell, the guests' rating (or, for
 * the robot manager, rooms checked and stock). Green where the figure is good, neutral otherwise;
 * nothing here is red or amber (what needs a person is in the bell). A role sees only figures of
 * screens it may open. One quiet line under the row says which figures are the robot's log, which
 * are test data and which are estimates (review round 2); an estimate carries "ca." and its
 * "Slik regner vi".
 */
export function KpiStrip({ data }: { data: DashboardData }) {
  const figures = selectHighlights(data);
  return (
    <section aria-label="Hotellet i tall" data-enter>
      <div className="@container border-y border-line py-6">
        <div className={cx("grid items-start gap-x-6 gap-y-6 lg:gap-x-8", COLUMNS[figures.length] ?? COLUMNS[6])}>
          {figures.map((figure) => (
            <Figure key={figure.id} figure={figure} loading={data.loading} />
          ))}
        </div>
        <p className="mt-5 text-xs text-muted">{figureSources(figures)}</p>
      </div>
    </section>
  );
}

/** A figure from the night: a skeleton while it loads, a dash when the night isn't there. */
function Figure({ figure, loading }: { figure: Highlight; loading: boolean }) {
  if (figure.value !== null) {
    const value = figure.prefix ? (
      <>
        <span className="mr-1.5 font-sans text-base font-medium text-muted">{figure.prefix}</span>
        <Digits value={figure.value} />
      </>
    ) : (
      figure.value
    );
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <Stat size="lg" label={figure.label} value={value} unit={figure.unit} tone={figure.tone} />
        {figure.detail && <p className="text-xs text-muted">{figure.detail}</p>}
        {figure.method && (
          <details className="group text-xs text-muted">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent-text hover:underline pointer-fine:min-h-8">
              {figure.methodLabel ?? "Slik regner vi"}
            </summary>
            <div className="flex max-w-[40ch] flex-col gap-1.5 pb-1">
              {figure.method.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }
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
