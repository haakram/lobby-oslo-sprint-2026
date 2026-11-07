import { cx } from "@/ui";

export type DataSource = "run-log" | "reception" | "test" | "local";

const WORD: Record<DataSource, string> = {
  "run-log": "Fra robotens natt (kjøringsloggen).",
  reception: "Fra AI-resepsjonisten.",
  // TODO(phase-3): every "test" note disappears when the PMS/inventory/staff integrations land.
  test: "Testdata til integrasjonen er på plass.",
  local: "Lagres bare i denne nettleseren.",
};

/**
 * One quiet line under a list that says where its figures come from, so nobody on the projector
 * takes test data for the hotel's real numbers (AI_RULES: stubs are marked).
 */
export function SourceNote({ sources, className }: { sources: DataSource | DataSource[]; className?: string }) {
  const list = Array.isArray(sources) ? sources : [sources];
  return <p className={cx("text-xs text-muted", className)}>{list.map((source) => WORD[source]).join(" ")}</p>;
}
