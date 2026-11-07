/**
 * TODO(phase-3): replace with the inventory integration (linen counts, amenity stock).
 * Test data: linen and amenities per store room for a ~36-room hotel, against what each room should
 * hold at the start of a day. "Lavt" is under a third of the expected count.
 */

export type StoreRoom = { id: string; name: string; floor: number; node: string };

export const STORES: readonly StoreRoom[] = [
  { id: "laundry", name: "Vaskeri", floor: 1, node: "laundry" },
  { id: "storage", name: "Lager", floor: 1, node: "storage" },
  { id: "lin-2", name: "Linrom 2. etasje", floor: 2, node: "corridor-2a" },
  { id: "lin-3", name: "Linrom 3. etasje", floor: 3, node: "corridor-3a" },
];

export type StockItem = {
  store: string;
  item: string;
  count: number;
  expected: number;
  unit: string;
};

export const STOCK: readonly StockItem[] = [
  { store: "laundry", item: "Laken", count: 64, expected: 80, unit: "stk" },
  { store: "laundry", item: "Dynetrekk", count: 52, expected: 80, unit: "stk" },
  { store: "laundry", item: "Putetrekk", count: 140, expected: 160, unit: "stk" },
  { store: "laundry", item: "Badehåndklær", count: 38, expected: 120, unit: "stk" },
  { store: "laundry", item: "Håndklær", count: 96, expected: 120, unit: "stk" },
  { store: "storage", item: "Toalettsett", count: 22, expected: 60, unit: "stk" },
  { store: "storage", item: "Vannflasker", count: 48, expected: 72, unit: "stk" },
  { store: "storage", item: "Kaffekapsler", count: 310, expected: 400, unit: "stk" },
  { store: "storage", item: "Såpe og sjampo", count: 15, expected: 60, unit: "sett" },
  { store: "storage", item: "Varselskilt, vått gulv", count: 3, expected: 4, unit: "stk" },
  { store: "lin-2", item: "Laken", count: 18, expected: 24, unit: "stk" },
  { store: "lin-2", item: "Håndklær", count: 9, expected: 36, unit: "stk" },
  { store: "lin-2", item: "Toalettsett", count: 10, expected: 18, unit: "stk" },
  { store: "lin-3", item: "Laken", count: 20, expected: 24, unit: "stk" },
  { store: "lin-3", item: "Håndklær", count: 30, expected: 36, unit: "stk" },
  { store: "lin-3", item: "Toalettsett", count: 4, expected: 18, unit: "stk" },
];

/** When the counts were last done (test data: this morning's handover). */
export const LAST_COUNT = "06:00";

export const LOW_SHARE = 1 / 3;

export function isLow(item: StockItem): boolean {
  return item.count < item.expected * LOW_SHARE;
}

export function share(item: StockItem): number {
  return item.expected > 0 ? Math.min(1, item.count / item.expected) : 1;
}

export function lowStock(stock: readonly StockItem[] = STOCK): StockItem[] {
  return stock.filter(isLow);
}

export function stockOf(storeId: string, stock: readonly StockItem[] = STOCK): StockItem[] {
  return stock.filter((item) => item.store === storeId);
}

export function storeName(storeId: string): string {
  return STORES.find((store) => store.id === storeId)?.name ?? storeId;
}
