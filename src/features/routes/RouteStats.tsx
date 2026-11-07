import { Card, Stat } from "@/ui";

function minutes(seconds: number): string {
  return `ca. ${Math.max(1, Math.round(seconds / 60))} min`;
}

/** Total metres, metres saved and how much shorter, against walking the list in order. */
export function RouteStats({
  metres,
  seconds,
  naiveMetres,
  saved,
}: {
  metres: number;
  seconds: number;
  naiveMetres: number;
  saved: { metres: number; percent: number };
}) {
  return (
    <section aria-label="Rutetall">
      <Card className="p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-3 sm:gap-6">
          <Stat label="Beste rute" value={Math.round(metres)} unit="m" />
          <Stat label="Spart" value={saved.metres} unit="m" tone="success" />
          <Stat label="Kortere" value={saved.percent} unit="%" tone="success" />
        </div>
        <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
          {saved.metres > 0 ? "Mot listerekkefølgen: " : "Listen er allerede i beste rekkefølge: "}
          <span className="font-mono text-text tabular-nums">{Math.round(naiveMetres)} m</span>
          {" · Gangtid "}
          <span className="font-mono text-text tabular-nums">{minutes(seconds)}</span>
        </p>
      </Card>
    </section>
  );
}
