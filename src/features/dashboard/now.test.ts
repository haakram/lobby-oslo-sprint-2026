import { describe, expect, it } from "vitest";
import type { WorkOrderView } from "@/features/maintenance/select";
import type { RequestView } from "@/features/requests/select";
import { type DashboardData, selectNow } from "./now";
import type { RobotView, RoomView } from "./selectors";

// The Nå band: what needs a person now, across every module the role may open, loudest first.
function data(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    role: "admin",
    loading: false,
    nightStatus: "ready",
    night: null,
    rooms: null,
    robot: null,
    requests: [],
    maintenance: [],
    outOfOrder: [],
    guests: { today: "2026-11-08", arrivals: [], departures: [], inHouse: [], booked: [], withNotes: [], roomsTonight: 0 },
    calls: { kind: "not-set-up" },
    retryCalls: () => {},
    lowStock: [],
    shift: "dag",
    onShift: [],
    ...overrides,
  };
}

function room(number: string, status: RoomView["status"]): RoomView {
  return { id: `room-${number}`, number, floor: Number(number[0]), status, source: null, statusAt: null, openOrders: 0 };
}

function order(id: string, priority: WorkOrderView["priority"], status: WorkOrderView["status"] = "ny"): WorkOrderView {
  return { id, origin: "personale", type: "teknisk", text: "Lekkasje", room: "room-107", place: null, priority, assignee: null, at: "16:40", reportedBy: "Beata", status, outOfOrder: false, robot: null };
}

function request(id: string, status: RequestView["status"]): RequestView {
  return { id, source: "stemme", kind: "Utstyr", room: "room-212", text: null, lang: "nb", at: "07:12", handler: "Mariam", status, actionable: true, tonight: false };
}

const ROBOT: RobotView = { clock: "05:58:07", location: "charging-dock", floor: 1, battery: 64, hands: [], cart: [], ended: true, current: null, last: null, queue: [] };

describe("selectNow (the Nå band)", () => {
  it("is empty before the night has loaded and nothing else is waiting", () => {
    expect(selectNow(data())).toEqual([]);
  });

  it("puts the cleaning route first, as the screen's primary action, when rooms must be cleaned", () => {
    const items = selectNow(data({ rooms: [room("201", "ma_vaskes"), room("214", "ma_vaskes"), room("103", "klar")] }));
    expect(items[0]).toMatchObject({
      module: "rom",
      tone: "warning",
      text: "2 rom må vaskes: 201, 214",
      action: { label: "Lag renholdsrute", href: "/ruter?rom=room-201,room-214", primary: true },
    });
  });

  it("says honestly that no room needs cleaning, and offers a check round for the unchecked ones", () => {
    const [row] = selectNow(data({ rooms: [room("103", "klar"), room("105", "ukjent"), room("208", "ikke_forstyrr")] }));
    expect(row).toMatchObject({ tone: "muted", text: "Ingen rom må vaskes · 1 rom er ikke sjekket", action: { label: "Lag sjekkrunde", href: "/ruter?rom=room-105" } });
    expect(row.action?.primary).toBeUndefined();
    expect(selectNow(data({ rooms: [room("103", "klar")] }))[0]).toMatchObject({ text: "Ingen rom må vaskes", action: null });
  });

  it("sorts the rows loudest first: danger, then warning, then the quiet ones", () => {
    const items = selectNow(
      data({
        rooms: [room("103", "klar")],
        maintenance: [order("wo-1", "hoy"), order("wo-2", "lav")],
        requests: [request("r-1", "venter"), request("r-2", "fullfort")],
        lowStock: [{ store: "laundry", item: "Badehåndklær", count: 38, expected: 120, unit: "stk" }],
        robot: ROBOT,
      }),
    );
    expect(items.map((item) => [item.id, item.tone])).toEqual([
      ["high", "danger"],
      ["requests", "warning"],
      ["stock", "warning"],
      ["dirty", "muted"],
      ["robot", "muted"],
    ]);
    expect(items.find((item) => item.id === "high")).toMatchObject({ text: "1 arbeidsordre med høy prioritet", action: { label: "Åpne Vedlikehold", href: "/vedlikehold" } });
    expect(items.find((item) => item.id === "requests")).toMatchObject({ text: "1 forespørsel venter på noen", action: { label: "Åpne Forespørsler", href: "/foresporsler" } });
    expect(items.find((item) => item.id === "stock")).toMatchObject({ text: "1 varer under minimum: badehåndklær", action: { label: "Åpne Lager", href: "/lager" } });
    expect(items.find((item) => item.id === "robot")).toMatchObject({ text: "Roboten er ferdig for natten · batteri 64 %", action: { href: "/hotell" } });
  });

  it("raises a request the robot failed, and the robot's low battery, to the louder tone", () => {
    const items = selectNow(data({ requests: [request("r-1", "feilet")], robot: { ...ROBOT, battery: 12, ended: false } }));
    expect(items.map((item) => [item.id, item.tone])).toEqual([
      ["requests", "danger"],
      ["robot", "warning"],
    ]);
    expect(items[1]).toMatchObject({ icon: "battery-low", text: "Roboten har lavt batteri, 12 %" });
    // The words say what made the row loud, not only the red.
    expect(items[0]).toMatchObject({ text: "1 forespørsel venter på noen · 1 feilet" });
  });

  it("lists the rooms out of order, the arrivals without a room and the callers to ring back", () => {
    const stay = { id: "stay-1", name: "Priya Nair", room: null, arrival: "2026-11-08", departure: "2026-11-10", guests: 2, notes: [], source: "pms" as const };
    const call = { id: "c1", startedAt: "2026-11-08T08:00:00Z", title: null, summary: null, callerName: null, requestType: null, arrival: null, departure: null, guests: null, needsCallback: true };
    const items = selectNow(
      data({
        outOfOrder: ["room-107", "room-213"],
        guests: { today: "2026-11-08", arrivals: [stay], departures: [], inHouse: [stay], booked: [], withNotes: [], roomsTonight: 1 },
        calls: { kind: "ready", calls: [call] },
      }),
    );
    expect(items.map((item) => item.text)).toEqual(["2 rom ute av drift: 107, 213", "1 ankomst i dag uten rom: Priya Nair", "1 innringer å ringe tilbake"]);
    expect(items.map((item) => item.action?.href)).toEqual(["/vedlikehold", "/gjester", "/resepsjon"]);
  });

  it("shows a role only the rows from modules it may open", () => {
    const full = data({
      rooms: [room("201", "ma_vaskes")],
      maintenance: [order("wo-1", "hoy")],
      outOfOrder: ["room-107"],
      lowStock: [{ store: "laundry", item: "Laken", count: 1, expected: 80, unit: "stk" }],
      robot: ROBOT,
      calls: { kind: "ready", calls: [{ id: "c1", startedAt: "2026-11-08T08:00:00Z", title: null, summary: null, callerName: null, requestType: null, arrival: null, departure: null, guests: null, needsCallback: true }] },
    });
    expect(selectNow({ ...full, role: "receptionist" }).map((item) => item.id)).toEqual(["dirty", "callbacks"]);
    expect(selectNow({ ...full, role: "robot" }).map((item) => item.id)).toEqual(["high", "dirty", "ooo", "stock", "robot"]);
    expect(selectNow(full).map((item) => item.id)).toEqual(["high", "dirty", "ooo", "callbacks", "stock", "robot"]);
  });

  it("returns every row, loudest first, so the band can name what it has no room for", () => {
    const stay = { id: "stay-1", name: "Lukas Brandt", room: null, arrival: "2026-11-08", departure: "2026-11-09", guests: 1, notes: [], source: "pms" as const };
    const items = selectNow(
      data({
        rooms: [room("201", "ma_vaskes")],
        requests: [request("r-1", "venter")],
        maintenance: [order("wo-1", "hoy")],
        outOfOrder: ["room-107"],
        guests: { today: "2026-11-08", arrivals: [stay], departures: [], inHouse: [stay], booked: [], withNotes: [], roomsTonight: 1 },
        lowStock: [{ store: "laundry", item: "Laken", count: 1, expected: 80, unit: "stk" }],
        robot: ROBOT,
      }),
    );
    // Seven rows: nothing is cut here; the band shows six and an "og 1 til" line (NowBand.test.tsx).
    expect(items).toHaveLength(7);
    expect(items.at(-1)?.id).toBe("robot");
  });
});
