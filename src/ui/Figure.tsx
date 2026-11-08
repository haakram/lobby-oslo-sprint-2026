import { Fragment, type ReactNode } from "react";

/** A separator between two digits: the decimal comma, a point, or the thousands space (nb-NO writes U+00A0). */
const SEPARATOR = /(?<=\d)([,.\u00a0\u202f ])(?=\d)/;
/** Words or a sign before the first digit ("ca. ", "+"). */
const LEAD = /^(\D+)(?=\d)/;
/** A unit or sign after the last digit (" %"). */
const TRAIL = /(?<=\d)(\D+)$/;

/**
 * A figure for a Martian Mono setting, with what isn't a digit set in the text face. A monospace gives
 * the decimal comma and the thousands space a full cell, so "4,7" read as "4 , 7", "151 530" as two
 * numbers, "ca. 13" as "ca . 13" and "88 %" with a gap on the projector (review round 1). A comma or
 * point also closes up on the wide digits beside it; a thousands space stays a thin gap. The figure is
 * read out whole (`sr-only`); the split copy is only drawn. A value that is only digits (or has no
 * digit at all) is returned as it is.
 */
export function Figure({ value }: { value: string | number }) {
  const text = String(value);
  const lead = LEAD.exec(text)?.[1] ?? "";
  const trail = TRAIL.exec(text)?.[1] ?? "";
  const parts = text.slice(lead.length, text.length - trail.length).split(SEPARATOR);
  if (!lead && !trail && parts.length === 1) return <>{text}</>;
  const drawn: ReactNode[] = parts.map((part, index) =>
    // split() with a capture group alternates: digits, separator, digits, …
    index % 2 === 1 ? (
      // A comma or point closes up on the wide digits beside it; a thousands space keeps a thin gap.
      <span key={index} className={/[,.]/.test(part) ? "mx-[-0.14em] font-sans" : "font-sans"}>
        {part}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {lead && <span className="font-sans">{lead}</span>}
        {drawn}
        {trail && <span className="font-sans">{trail}</span>}
      </span>
    </>
  );
}
