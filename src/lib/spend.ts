import "server-only";
import { serverEnv } from "./env";

const INPUT_USD_PER_MTOK = 4;
const OUTPUT_USD_PER_MTOK = 20;

export function costUsd(usage: { input_tokens: number; output_tokens: number }): number {
  return (
    (usage.input_tokens * INPUT_USD_PER_MTOK + usage.output_tokens * OUTPUT_USD_PER_MTOK) / 1_000_000
  );
}

export type SpendMeter = {
  canSpend(): boolean;
  record(usd: number): void;
  spentUsd(): number;
};

export function createSpendMeter(limitUsd: number): SpendMeter {
  let spent = 0;
  return {
    // Small epsilon: float sums such as 0.004 + 0.006 must still reach the limit.
    canSpend: () => spent < limitUsd - 1e-9,
    record: (usd) => {
      spent += usd;
    },
    spentUsd: () => spent,
  };
}

let shared: SpendMeter | undefined;
const sharedMeter = () => (shared ??= createSpendMeter(serverEnv().APP_CLAUDE_BUDGET_USD));

/** Process-wide meter for the app's Claude spend; the limit is read on first use. */
export const appSpend: SpendMeter = {
  canSpend: () => sharedMeter().canSpend(),
  record: (usd) => sharedMeter().record(usd),
  spentUsd: () => sharedMeter().spentUsd(),
};
