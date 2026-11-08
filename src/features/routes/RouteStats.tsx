import { Card, Stat } from "@/ui";

function minutes(seconds: number): string {
  return `ca. ${Math.max(1, Math.round(seconds / 60))} min`;
}

/** "216 m (32 % kortere)" or "216 m (like kort)", for one baseline. */
function Baseline({ label, metres, saved }: { label: string; metres: number; saved: { metres: number; percent: number } }) {
  return (
    <div className="contents">
      <dt>{label}:</dt>
      <dd className="text-text">
        <span className="font-mono whitespace-nowrap tabular-nums">{Math.round(metres)} m</span>{" "}
        {saved.metres > 0 ? (
          <span className="whitespace-nowrap">
            (<span className="font-mono tabular-nums">{saved.percent}</span> % kortere)
          </span>
        ) : (
          "(like kort)"
        )}
      </dd>
    </div>
  );
}

/**
 * The pick route's figures. The saving leads against shelf order (the list sorted by location code,
 * as a warehouse system prints it), the baseline a warehouse person would ask for; the list as
 * written is shown beside it, named, so the larger figure never stands alone (domain review, round 3).
 */
export function RouteStats({
  metres,
  seconds,
  naiveMetres,
  saved,
  shelfMetres,
  savedOnShelves,
}: {
  metres: number;
  seconds: number;
  /** The list in the order it was written, and what the best round saves on it. */
  naiveMetres: number;
  saved: { metres: number; percent: number };
  /** The same shelves in location-code order, and what the best round saves on that. */
  shelfMetres: number;
  savedOnShelves: { metres: number; percent: number };
}) {
  const shorter = savedOnShelves.metres > 0;
  return (
    <section aria-label="Rutetall">
      <Card className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6">
          <Stat label="Beste rute" value={Math.round(metres)} unit="m" />
          {shorter ? (
            <>
              <Stat label="Spart mot hyllerekkefølge" value={savedOnShelves.metres} unit="m" tone="success" />
              <Stat label="Kortere" value={savedOnShelves.percent} unit="%" tone="success" />
            </>
          ) : (
            <Stat label="Gangtid" value={Math.max(1, Math.round(seconds / 60))} unit="min" />
          )}
        </div>
        <dl aria-label="Sammenlignet med" className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-line pt-3 text-sm text-muted">
          <Baseline label="Mot hyllerekkefølge" metres={shelfMetres} saved={savedOnShelves} />
          <Baseline label="Mot listerekkefølgen" metres={naiveMetres} saved={saved} />
          {shorter && (
            <div className="contents">
              <dt>Gangtid:</dt>
              <dd className="font-mono whitespace-nowrap text-text tabular-nums">{minutes(seconds)}</dd>
            </div>
          )}
        </dl>
      </Card>
    </section>
  );
}
