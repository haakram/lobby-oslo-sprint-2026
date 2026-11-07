import { fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PicklistProvider, usePicklist } from "@/features/picklist/PicklistProvider";
import { planCleaning } from "./cleaningPlan";
import { hotelMap } from "./hotelMap";
import { loadRoutes } from "./loadRoutes";
import { RoutesScreen, type RouteParams } from "./RoutesScreen";

function Seed({ skus, children }: { skus: string[]; children: ReactNode }) {
  const { add } = usePicklist();
  useEffect(() => {
    skus.forEach(add);
  }, [skus, add]);
  return <>{children}</>;
}

function renderWith(skus: string[], screenElement: ReactNode = <RoutesScreen params={{ modus: "plukk" }} />) {
  return render(
    <PicklistProvider>
      <Seed skus={skus}>{screenElement}</Seed>
    </PicklistProvider>,
  );
}

// A short night: two rooms to clean, one with guests, one Do Not Disturb, and one task walked.
const NIGHT = [
  { v: 1, type: "state", clock: "22:00:00", location: "charging-dock", score: 0 },
  { v: 1, type: "decision", kind: "room_status", data: { room: "room-214", status: "ma_vaskes", source: "room_check" } },
  { v: 1, type: "decision", kind: "room_status", data: { room: "room-201", status: "ma_vaskes", source: "room_check" } },
  { v: 1, type: "decision", kind: "room_status", data: { room: "room-319", status: "opptatt", source: "knock" } },
  { v: 1, type: "decision", kind: "room_status", data: { room: "room-208", status: "ikke_forstyrr", source: "door_sign" } },
  { v: 1, type: "decision", kind: "task_start", data: { request: "R-001", kind: "amenity", room: "room-104" } },
  { v: 1, type: "call", cmd: "move", args: { to: "lobby" }, ok: true, clock: "22:00:08", result: { at: "lobby", metres: 8 } },
  { v: 1, type: "call", cmd: "move", args: { to: "corridor-1a" }, ok: true, clock: "22:00:17", result: { at: "corridor-1a", metres: 9 } },
  { v: 1, type: "call", cmd: "move", args: { to: "corridor-1b" }, ok: true, clock: "22:00:30", result: { at: "corridor-1b", metres: 13 } },
  { v: 1, type: "call", cmd: "move", args: { to: "room-104" }, ok: true, clock: "22:00:37", result: { at: "room-104", metres: 4 } },
  { v: 1, type: "decision", kind: "task_done", data: { request: "R-001", status: "done" } },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(NIGHT, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderRoutes = (params: RouteParams) => renderWith([], <RoutesScreen params={params} />);

describe("RoutesScreen, Renhold", () => {
  it("opens on Renhold and says what to do when no rooms are chosen", async () => {
    renderRoutes({});
    expect(screen.getByRole("tab", { name: /Renhold/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Ingen rom valgt" })).toBeInTheDocument();
    expect(screen.getByText("Velg rom på kartet eller hent rommene som må vaskes.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/runs/demo.jsonl", expect.anything());
    // The night's log names two rooms to clean.
    fireEvent.click(await screen.findByRole("button", { name: /Hent rommene som må vaskes/ }));
    const stops = within(screen.getByRole("list", { name: "Rekkefølge" })).getAllByRole("listitem");
    expect(stops).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Rutetall" })).toBeInTheDocument();
  });

  it("loads the rooms from ?rom= and draws their route", () => {
    renderRoutes({ rom: "room-201,room-214" });
    const list = screen.getByRole("list", { name: "Rekkefølge" });
    expect(within(list).getByText("Rom 201")).toBeInTheDocument();
    expect(within(list).getByText("Rom 214")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Rom 201/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("says which rooms from the link are not in the hotel", () => {
    renderRoutes({ rom: "201,999" });
    expect(screen.getByRole("status")).toHaveTextContent("Fant ikke 999 i hotellkartet");
    expect(within(screen.getByRole("list", { name: "Rekkefølge" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows the saving against the order given, with the best route's metres", () => {
    const rooms = ["room-319", "room-104", "room-201", "room-317"];
    const plan = planCleaning(hotelMap(), { start: "laundry", rooms, cart: true });
    if (!plan || "error" in plan) throw new Error("expected a plan");
    renderRoutes({ rom: rooms.join(",") });
    const band = screen.getByRole("region", { name: "Rutetall" });
    expect(band).toHaveTextContent(`${plan.saved.metres} m spart · ${plan.saved.percent} % kortere`);
    expect(within(band).getByText(String(Math.round(plan.tour.metres)))).toBeInTheDocument();
    expect(within(band).getByText(String(plan.elevatorRides))).toBeInTheDocument();
  });

  it("adds a room tapped on the plan and removes one from the list", async () => {
    renderRoutes({ rom: "room-201" });
    fireEvent.click(await screen.findByRole("button", { name: "Rom 319, opptatt" }));
    expect(within(screen.getByRole("list", { name: "Rekkefølge" })).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Fjern rom 201" }));
    const list = screen.getByRole("list", { name: "Rekkefølge" });
    expect(within(list).queryByText("Rom 201")).not.toBeInTheDocument();
    expect(within(list).getByText("Rom 319")).toBeInTheDocument();
  });

  it("switches the cart off and the start point", () => {
    renderRoutes({ rom: "room-201", start: "front-desk", vogn: "nei" });
    expect(screen.getByRole("switch", { name: "Vogn" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Resepsjon" })).toBeChecked();
    fireEvent.click(screen.getByRole("switch", { name: "Vogn" }));
    expect(screen.getByRole("switch", { name: "Vogn" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Lager" }));
    expect(screen.getByText(/Tilbake til lager/)).toBeInTheDocument();
  });

  it("keeps the map working when the night's log can't be read", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 500 }));
    renderRoutes({ rom: "room-201" });
    expect(await screen.findByText("Fikk ikke lest nattens logg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prøv igjen" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Rekkefølge" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("flags a room with Ikke forstyrr", async () => {
    renderRoutes({ rom: "room-208" });
    expect(await screen.findByText(/Bank på før du går inn/)).toBeInTheDocument();
  });
});

describe("RoutesScreen, Robot", () => {
  it("shows the metres walked and one task's path", async () => {
    renderRoutes({ modus: "robot" });
    const stats = await screen.findByRole("region", { name: "Natten i tall" });
    expect(within(stats).getByText("34")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /R-001/ }));
    expect(screen.getByRole("heading", { name: "R-001 · Utstyr til rom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /R-001/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers a retry when the log can't be read", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 503 }));
    renderRoutes({ modus: "robot" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Fikk ikke lest nattens logg");
  });

  it("says so when the robot has not walked yet", async () => {
    fetchMock.mockImplementation(async () => new Response(NIGHT.split("\n").slice(0, 2).join("\n"), { status: 200 }));
    renderRoutes({ modus: "robot" });
    expect(await screen.findByRole("heading", { name: "Roboten har ikke gått noen steder ennå" })).toBeInTheDocument();
  });
});

// Knekkebrød (hylle 2A), Sjampo (hylle 1A), Vann (hylle 2B), in that list order.
// List order on the stub map: 52 + 54 + 50 + 48 = 204 m. Best: 144 m. Saved 60 m, 29 %.
const THREE = ["FT-1007", "FT-1001", "FT-1010"];

describe("RoutesScreen, Plukkliste", () => {
  it("shows the empty state when the pick list is empty", () => {
    renderWith([]);
    expect(screen.getByRole("heading", { name: "Plukklisten er tom" })).toBeInTheDocument();
    expect(screen.getByText(/Legg til varer fra Øyne/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Åpne Øyne" })).toHaveAttribute("href", "/oyne");
  });

  it("shows total metres, saved metres and saved percent for three SKUs", () => {
    renderWith(THREE);
    const stats = screen.getByRole("region", { name: "Rutetall" });
    expect(within(stats).getByText("144")).toBeInTheDocument();
    expect(within(stats).getByText("60")).toBeInTheDocument();
    expect(within(stats).getByText("29")).toBeInTheDocument();
    expect(within(stats).getAllByText("m")).toHaveLength(2);
    expect(within(stats).getByText("%")).toBeInTheDocument();
    expect(within(stats).getByText(/204 m/)).toBeInTheDocument();
  });

  it("lists one numbered stop per shelf, in walking order", () => {
    renderWith(THREE);
    const list = screen.getByRole("list", { name: "Plukkrekkefølge" });
    const stops = within(list).getAllByRole("listitem");
    expect(stops).toHaveLength(3);
    expect(within(list).getByText("Sjampo 250 ml")).toBeInTheDocument();
  });

  it("removes a product from the pick list", () => {
    renderWith(THREE);
    fireEvent.click(screen.getByRole("button", { name: "Fjern Sjampo 250 ml" }));
    expect(screen.queryByText("Sjampo 250 ml")).not.toBeInTheDocument();
    // Hylle 2A and 2B only: 52 + 20 + 48 = 120 m against 52 + 20 + 48 in list order too.
    expect(within(screen.getByRole("region", { name: "Rutetall" })).getByText("120")).toBeInTheDocument();
  });

  it("opens the pick list and adds the SKU from ?sku= on load", () => {
    renderWith([], <RoutesScreen params={{ sku: "FT-1007" }} />);
    expect(screen.getByRole("tab", { name: /Plukkliste/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Knekkebrød 520 g")).toBeInTheDocument();
  });

  it("ignores a ?sku= that is not in the catalogue", () => {
    renderWith([], <RoutesScreen params={{ sku: "FT-9999" }} />);
    expect(screen.getByRole("heading", { name: "Plukklisten er tom" })).toBeInTheDocument();
  });

  it("switches floors with the floor tabs", () => {
    renderWith(THREE);
    const second = screen.getByRole("tab", { name: /2\. etasje/ });
    expect(second).toHaveAttribute("aria-selected", "false");
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: /2\. etasje/ })).toBeInTheDocument();
  });

  it("says so when the map has no route, without throwing", () => {
    const loaded = loadRoutes();
    if (!loaded.ok) throw new Error(loaded.error);
    const noLegs = { ...loaded.matrix, legs: {} };
    renderWith(THREE, <RoutesScreen params={{ modus: "plukk" }} matrix={noLegs} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Ingen rute funnet");
  });

  it("switches between the three modes with the tabs", () => {
    renderWith([]);
    fireEvent.click(screen.getByRole("tab", { name: /Renhold/ }));
    expect(screen.getByRole("heading", { name: "Ingen rom valgt" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Plukkliste/ }));
    expect(screen.getByRole("heading", { name: "Plukklisten er tom" })).toBeVisible();
  });
});
