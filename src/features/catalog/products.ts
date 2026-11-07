// Test data only: made-up products and SKUs (AI_RULES R3.4).
// `location` is a node id on the stub map (Task 4) until the real route matrix lands.
// TODO(phase-2): re-point locations at agent/data/hotel_seed1.json node ids when agent/ is on main.

export type ProductCategory = "hygiene" | "food" | "linen" | "other";

export type Product = {
  sku: string;
  name: string;
  category: ProductCategory;
  description: string;
  /** Map node id. */
  location: string;
  locationLabel: string;
};

const SHELF = {
  "shelf-1a": "Lager 1, hylle A",
  "shelf-1b": "Lager 1, hylle B",
  "shelf-2a": "Lager 2, hylle A",
  "shelf-2b": "Lager 2, hylle B",
} as const;

type ShelfId = keyof typeof SHELF;

function product(
  sku: string,
  name: string,
  category: ProductCategory,
  description: string,
  location: ShelfId,
): Product {
  return { sku, name, category, description, location, locationLabel: SHELF[location] };
}

export const PRODUCTS: readonly Product[] = Object.freeze([
  product("FT-1001", "Sjampo 250 ml", "hygiene", "Hvit flaske med grønn klaffekork, mild sjampo for hotellrom.", "shelf-1a"),
  product("FT-1002", "Flytende såpe 300 ml", "hygiene", "Klar pumpeflaske med lys gul håndsåpe.", "shelf-1a"),
  product("FT-1003", "Dusjsåpe 250 ml", "hygiene", "Blå tube som står på korken, frisk duft.", "shelf-1a"),
  product("FT-1004", "Såpestykke 100 g", "hygiene", "Hvitt såpestykke i papiresken med grått trykk.", "shelf-1b"),
  product("FT-1005", "Tannkrem 75 ml", "hygiene", "Hvit tube med rød stripe i smal kartong.", "shelf-1b"),
  product("FT-1006", "Bodylotion 200 ml", "hygiene", "Beige flaske med pumpe, uparfymert.", "shelf-1b"),
  product("FT-1007", "Knekkebrød 520 g", "food", "Flat brun kartong med grovt rugknekkebrød.", "shelf-2a"),
  product("FT-1008", "Havrebar 40 g", "food", "Enkeltpakket bar i gul folie med havre og honning.", "shelf-2a"),
  product("FT-1009", "Posesuppe tomat", "food", "Rød pose med pulversuppe til én kopp.", "shelf-2a"),
  product("FT-1010", "Vann 0,5 l", "food", "Klar plastflaske med blå etikett, uten kullsyre.", "shelf-2b"),
  product("FT-1011", "Badehåndkle 70 x 140 cm", "linen", "Hvitt frottéhåndkle, brettet og pakket i plast.", "shelf-2b"),
  product("FT-1012", "Håndkle 50 x 70 cm", "linen", "Lite hvitt frottéhåndkle med grå kant.", "shelf-2b"),
]);

const BY_SKU = new Map(PRODUCTS.map((p) => [p.sku, p]));

export function productBySku(sku: string): Product | undefined {
  return BY_SKU.get(sku);
}
