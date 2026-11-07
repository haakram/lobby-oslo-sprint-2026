import { Button, cx, ErrorState, Skeleton } from "@/ui";
import { placeLabel } from "./hotelMap";
import type { RoomPreset } from "./nightRooms";
import { CLEANING_STARTS, type CleaningStart } from "./query";
import type { NightLogStatus } from "./useNightLog";

const LABEL = "mb-2 block text-sm text-muted";

function StartPicker({ value, onChange }: { value: CleaningStart; onChange: (start: CleaningStart) => void }) {
  return (
    <fieldset>
      <legend className={LABEL}>Start og slutt</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-md bg-sunken p-1">
        {CLEANING_STARTS.map((s) => (
          <label key={s.id} className="relative">
            <input
              type="radio"
              name="ruter-start"
              value={s.id}
              checked={value === s.id}
              onChange={() => onChange(s.id)}
              className="peer sr-only"
            />
            <span
              className={cx(
                "inline-flex min-h-12 cursor-pointer items-center rounded-md border px-4 text-base font-semibold",
                "transition-colors duration-[120ms] ease-standard",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                value === s.id ? "border-line bg-surface text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              {s.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CartSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div>
      <span id="ruter-vogn" className={LABEL}>
        Vogn
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="ruter-vogn"
        aria-describedby="ruter-vogn-hint"
        onClick={() => onChange(!on)}
        className="inline-flex min-h-12 items-center gap-3 rounded-md px-1 text-left"
      >
        <span
          aria-hidden="true"
          className={cx(
            "relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-[120ms] ease-standard",
            on ? "border-text bg-text" : "border-line-strong bg-sunken",
          )}
        >
          <span
            className={cx(
              "absolute top-0.5 left-0.5 size-5.5 rounded-full bg-surface transition-transform duration-[120ms] ease-standard",
              on && "translate-x-5",
            )}
          />
        </span>
        <span id="ruter-vogn-hint" className="text-base">
          {on ? "Med vogn: heis, ikke trapp" : "Uten vogn: trapp er lov"}
        </span>
      </button>
    </div>
  );
}

function Presets({
  status,
  presets,
  doNotDisturb,
  onLoad,
  onRetry,
}: {
  status: NightLogStatus;
  presets: RoomPreset[];
  doNotDisturb: string[];
  onLoad: (preset: RoomPreset) => void;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <ErrorState
        className="max-w-sm"
        title="Fikk ikke lest nattens logg"
        body="Romgruppene mangler. Du kan fortsatt velge rom på kartet."
        action={
          <Button variant="secondary" onClick={onRetry}>
            Prøv igjen
          </Button>
        }
      />
    );
  }
  return (
    <div>
      <span className={LABEL}>Hent rom fra natten</span>
      {status === "loading" ? (
        <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Henter nattens romstatus">
          <Skeleton className="h-12 w-36" />
          <Skeleton className="h-12 w-44" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button key={p.id} variant="secondary" disabled={p.rooms.length === 0} title={p.hint} onClick={() => onLoad(p)}>
              {p.label}
              <span className="font-mono text-sm tabular-nums">{p.rooms.length}</span>
            </Button>
          ))}
        </div>
      )}
      {status === "ready" && doNotDisturb.length > 0 && (
        <p className="mt-2 max-w-[44ch] text-sm text-muted">
          {doNotDisturb.map((r) => placeLabel(r)).join(", ")} hadde Ikke forstyrr i natt og er ikke med.
        </p>
      )}
      {status === "empty" && <p className="mt-2 text-sm text-muted">Nattens logg er tom. Velg rom på kartet.</p>}
    </div>
  );
}

export function CleaningControls(props: {
  start: CleaningStart;
  onStart: (start: CleaningStart) => void;
  cart: boolean;
  onCart: (on: boolean) => void;
  logStatus: NightLogStatus;
  presets: RoomPreset[];
  doNotDisturb: string[];
  onPreset: (preset: RoomPreset) => void;
  onRetry: () => void;
}) {
  return (
    <section aria-label="Planlegg runden" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-10">
        <StartPicker value={props.start} onChange={props.onStart} />
        <CartSwitch on={props.cart} onChange={props.onCart} />
        <Presets
          status={props.logStatus}
          presets={props.presets}
          doNotDisturb={props.doNotDisturb}
          onLoad={props.onPreset}
          onRetry={props.onRetry}
        />
      </div>
    </section>
  );
}
