"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Picklist = {
  skus: string[];
  add(sku: string): void;
  remove(sku: string): void;
  clear(): void;
  /**
   * Fills an empty list with an example order, once per session (Ruter's Plukkliste shows a route
   * without anyone scanning first). Never overwrites a list in use, and never comes back after Tøm.
   */
  seedOnce(skus: readonly string[]): void;
};

const PicklistContext = createContext<Picklist | null>(null);

/** In-memory pick list: survives client navigation, not a reload. */
export function PicklistProvider({ children, initial = [] }: { children: ReactNode; initial?: readonly string[] }) {
  const [skus, setSkus] = useState<string[]>(() => [...initial]);
  const seeded = useRef(false);

  const add = useCallback((sku: string) => {
    setSkus((current) => (current.includes(sku) ? current : [...current, sku]));
  }, []);
  const remove = useCallback((sku: string) => {
    setSkus((current) => current.filter((s) => s !== sku));
  }, []);
  const clear = useCallback(() => setSkus([]), []);
  const seedOnce = useCallback((example: readonly string[]) => {
    if (seeded.current) return;
    seeded.current = true;
    setSkus((current) => (current.length > 0 ? current : [...example]));
  }, []);

  const value = useMemo(() => ({ skus, add, remove, clear, seedOnce }), [skus, add, remove, clear, seedOnce]);
  return <PicklistContext.Provider value={value}>{children}</PicklistContext.Provider>;
}

export function usePicklist(): Picklist {
  const value = useContext(PicklistContext);
  if (!value) throw new Error("usePicklist must be used inside <PicklistProvider>.");
  return value;
}
