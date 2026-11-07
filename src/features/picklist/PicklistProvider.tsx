"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Picklist = {
  skus: string[];
  add(sku: string): void;
  remove(sku: string): void;
  clear(): void;
};

const PicklistContext = createContext<Picklist | null>(null);

/** In-memory pick list: survives client navigation, not a reload. */
export function PicklistProvider({ children }: { children: ReactNode }) {
  const [skus, setSkus] = useState<string[]>([]);

  const add = useCallback((sku: string) => {
    setSkus((current) => (current.includes(sku) ? current : [...current, sku]));
  }, []);
  const remove = useCallback((sku: string) => {
    setSkus((current) => current.filter((s) => s !== sku));
  }, []);
  const clear = useCallback(() => setSkus([]), []);

  const value = useMemo(() => ({ skus, add, remove, clear }), [skus, add, remove, clear]);
  return <PicklistContext.Provider value={value}>{children}</PicklistContext.Provider>;
}

export function usePicklist(): Picklist {
  const value = useContext(PicklistContext);
  if (!value) throw new Error("usePicklist must be used inside <PicklistProvider>.");
  return value;
}
