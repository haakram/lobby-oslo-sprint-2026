import { describe, expect, it } from "vitest";
import { parseCart, parseMode, parseRoomQuery, parseStart } from "./query";

const KNOWN = new Set(["room-104", "room-201", "room-214", "room-319"]);

describe("parseRoomQuery", () => {
  it("reads the dashboard's ?rom=room-201,room-214 in the order given", () => {
    expect(parseRoomQuery("room-214,room-201", KNOWN)).toEqual({ rooms: ["room-214", "room-201"], unknown: [] });
  });

  it("takes bare numbers and rom-201, split by commas or spaces, each room once", () => {
    expect(parseRoomQuery("201 rom-319, 201;ROOM-104", KNOWN)).toEqual({
      rooms: ["room-201", "room-319", "room-104"],
      unknown: [],
    });
  });

  it("joins repeated ?rom= values", () => {
    expect(parseRoomQuery(["201", "214"], KNOWN).rooms).toEqual(["room-201", "room-214"]);
  });

  it("reports what is not a guest room on the map, cut to 32 characters", () => {
    const long = "x".repeat(80);
    expect(parseRoomQuery(`999,laundry,${long},201`, KNOWN)).toEqual({
      rooms: ["room-201"],
      unknown: ["999", "laundry", "x".repeat(32)],
    });
  });

  it("is empty for no value or a blank one", () => {
    expect(parseRoomQuery(undefined, KNOWN)).toEqual({ rooms: [], unknown: [] });
    expect(parseRoomQuery(" , ", KNOWN)).toEqual({ rooms: [], unknown: [] });
  });

  it("reads at most 64 values", () => {
    const many = Array.from({ length: 100 }, () => "999").map((v, i) => `${v}${i}`).join(",");
    expect(parseRoomQuery(many, KNOWN).unknown).toHaveLength(64);
  });
});

describe("parseStart, parseMode, parseCart", () => {
  it("accepts only the listed values", () => {
    expect(parseStart("laundry")).toBe("laundry");
    expect(parseStart(["Front-Desk"])).toBe("front-desk");
    expect(parseStart("kitchen-pass")).toBeNull();
    expect(parseMode("robot")).toBe("robot");
    expect(parseMode("plukk")).toBe("plukk");
    expect(parseMode("admin")).toBeNull();
    expect(parseMode(undefined)).toBeNull();
  });

  it("reads the cart switch as yes, no or unset", () => {
    expect(parseCart("1")).toBe(true);
    expect(parseCart("ja")).toBe(true);
    expect(parseCart("nei")).toBe(false);
    expect(parseCart("0")).toBe(false);
    expect(parseCart("kanskje")).toBeNull();
    expect(parseCart(undefined)).toBeNull();
  });
});
