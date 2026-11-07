import { describe, expect, it } from "vitest";
import { parseCart, parseMode, parseRoomQuery, parseStart } from "./query";

describe("parseRoomQuery", () => {
  it("reads the dashboard's ?rom=room-201,room-214 in the order given", () => {
    expect(parseRoomQuery("room-214,room-201")).toEqual({ rooms: ["room-214", "room-201"], unknown: [] });
  });

  it("takes bare numbers and rom-201, split by commas or spaces, each room once", () => {
    expect(parseRoomQuery("201 rom-319, 201;ROOM-104")).toEqual({
      rooms: ["room-201", "room-319", "room-104"],
      unknown: [],
    });
  });

  it("joins repeated ?rom= values", () => {
    expect(parseRoomQuery(["201", "214"]).rooms).toEqual(["room-201", "room-214"]);
  });

  it("keeps a room id the map may lack, and reports what is not a room id, cut to 32 characters", () => {
    const long = "x".repeat(80);
    expect(parseRoomQuery(`327,laundry,${long},201,room-12345`)).toEqual({
      rooms: ["room-327", "room-201"],
      unknown: ["laundry", "x".repeat(32), "room-12345"],
    });
  });

  it("is empty for no value or a blank one", () => {
    expect(parseRoomQuery(undefined)).toEqual({ rooms: [], unknown: [] });
    expect(parseRoomQuery(" , ")).toEqual({ rooms: [], unknown: [] });
  });

  it("reads at most 64 values", () => {
    const many = Array.from({ length: 100 }, (_, i) => `x${i}`).join(",");
    expect(parseRoomQuery(many).unknown).toHaveLength(64);
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
