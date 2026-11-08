import type { ItemKind } from "./schema";

/**
 * What the card's badge says when a thing is not in the catalogue. Only a supply can be missing
 * from it: the catalogue lists consumables, so a pillow or a cap is never "ikke i katalogen".
 */
export const KIND_BADGE: Record<ItemKind, string> = {
  supply: "Ikke i katalogen",
  room: "Hotellutstyr",
  guest: "Gjestens eiendel",
  person: "Person",
  other: "Gjenstand",
};

/** The same, short, after the name on a box's tag; null says nothing extra. */
export const KIND_TAG: Record<ItemKind, string | null> = {
  supply: "ikke i katalogen",
  room: "hotellutstyr",
  guest: "gjestens eiendel",
  person: null,
  other: null,
};
