"use client";

import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { SourceNote } from "@/features/modules/SourceNote";
import { useOsloHour } from "@/features/modules/useNow";
import { Badge, Card, cx, Monogram, Stat } from "@/ui";
import { onShift, SHIFTS, shiftAt, STAFF, type StaffMember } from "./testData";

/** Ansatte og vakter: who is on which shift today, what they cover, and who is off. */
export function StaffScreen() {
  const hour = useOsloHour();
  const now = shiftAt(hour);
  const current = onShift(now);
  const off = STAFF.filter((member) => member.shift === null);
  const next = SHIFTS[(SHIFTS.findIndex((shift) => shift.id === now) + 1) % SHIFTS.length];

  return (
    <ModulePage module="ansatte" lede="Dagens vakter: hvem som er her nå, hva de dekker, og hvem som kommer.">
      <FigureRow label="Vaktene i tall">
        <Stat label="På vakt nå" value={current.length} tone="success" />
        <Stat label="Renholdere i dag" value={onShift("dag").filter((member) => member.role === "Renhold").length} />
        <Stat label="Fri i dag" value={off.length} />
        <Stat label="Neste vaktskifte" value={next.from} unit={next.label.toLowerCase()} />
      </FigureRow>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {SHIFTS.map((shift) => {
          const people = onShift(shift.id);
          const active = shift.id === now;
          return (
            // On a phone the shift that is on now comes first.
            <section key={shift.id} aria-labelledby={`shift-${shift.id}`} data-enter className={cx(active && "order-first lg:order-none")}>
              <Card className={cx("sm:p-6", active && "border-line-strong")}>
                <PanelHead
                  id={`shift-${shift.id}`}
                  title={shift.label}
                  note={`${shift.from}–${shift.to}`}
                  count={people.length}
                  action={
                    active ? (
                      <span className="flex items-center gap-3 text-sm text-muted">
                        {shift.from}–{shift.to}
                        <Badge tone="success">Nå</Badge>
                      </span>
                    ) : undefined
                  }
                />
                {people.length === 0 ? (
                  <p className="mt-3 text-base text-muted">Ingen på denne vakten i dag.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {people.map((member) => (
                      <Person key={member.id} member={member} />
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          );
        })}
      </div>

      <section aria-labelledby="off-heading" data-enter>
        <Card className="sm:p-6">
          <PanelHead id="off-heading" title="Fri i dag" count={off.length} />
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {off.map((member) => (
              <li key={member.id} className="flex items-center gap-2 text-sm">
                <Monogram name={member.name} size={28} />
                <span className="font-medium">{member.name}</span>
                <span className="text-muted">{member.role}</span>
              </li>
            ))}
          </ul>
          <SourceNote className="mt-4" sources="test" />
        </Card>
      </section>
    </ModulePage>
  );
}

function Person({ member }: { member: StaffMember }) {
  const robot = member.name === "Roboten";
  return (
    <li className="flex items-center gap-3 py-2.5">
      {robot ? (
        // The robot's monogram is the accent (DESIGN.md "Monogram"); Monogram's own soft fill would win the class order.
        <span
          aria-hidden="true"
          style={{ width: 32, height: 32, fontSize: 14 }}
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold leading-none text-on-accent"
        >
          R
        </span>
      ) : (
        <Monogram name={member.name} size={32} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{member.name}</span>
        <span className="text-sm break-words text-muted">
          {member.role}
          {member.area ? ` · ${member.area}` : ""}
        </span>
      </div>
      <span className="text-sm whitespace-nowrap text-muted sm:text-xs">{member.phone}</span>
    </li>
  );
}
