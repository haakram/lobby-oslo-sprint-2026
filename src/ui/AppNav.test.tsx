import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/features/auth/roles";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { MODULE_GROUPS, MODULES } from "@/features/modules/registry";
import { AppNav } from "./AppNav";
import { barItemsFor, groupsFor, NAV_GROUPS } from "./nav";

const path = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

function as(role: Role, children: ReactNode) {
  const name = role === "admin" ? "Hamad" : role === "host" ? "Ingrid Berge" : "Test";
  const session = { user: { u: role, name, role }, view: role, effectiveRole: role, exp: 0 };
  return <SessionProvider session={session}>{children}</SessionProvider>;
}

/** The user plate's button (the name on it). */
const plateOf = (name: string | RegExp = /Hamad|Test|Ingrid/) => screen.getByRole("button", { name });

/** jsdom has no media queries, so AppNav reads as desktop; this says "a phone". */
function onAPhone() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  path.current = "/";
});

describe("the navigation groups, from the module registry", () => {
  it("mirrors the registry: four groups, every module in its group, in registry order", () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(MODULE_GROUPS.map((group) => group.label));
    expect(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href))).toEqual(MODULES.map((module) => module.route));
    const rom = NAV_GROUPS[0].items.find((item) => item.href === "/rom");
    expect(rom).toMatchObject({ label: "Rom og renhold", short: "Rom", hint: "Romstatus, renholdere og dagens runde", icon: "key", pinned: true });
    // A module without a short name uses its full name in the phone bar.
    expect(NAV_GROUPS[0].items.find((item) => item.href === "/ruter")?.short).toBe("Ruter");
  });

  it("gives the receptionist the hotel, the desk's part of Drift and Resepsjon, not the robot", () => {
    const groups = groupsFor("receptionist");
    expect(groups.map((group) => group.label)).toEqual(["Hotellet", "Drift", "Resepsjon"]);
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual(["/", "/rom", "/gjester", "/ruter", "/overlevering", "/natt", "/foresporsler", "/ansatte", "/resepsjon"]);
  });

  it("gives the robot manager the hotel, maintenance and stores, and the robot, not the reception", () => {
    const groups = groupsFor("robot");
    expect(groups.map((group) => group.label)).toEqual(["Hotellet", "Drift", "Roboten"]);
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual(["/", "/rom", "/ruter", "/foresporsler", "/vedlikehold", "/lager", "/hotell", "/natteskift", "/oyne", "/stemme"]);
  });

  it("gives the host only Utleie: their apartments, messages, bookings and supplies, nothing of the hotel", () => {
    const groups = groupsFor("host");
    expect(groups.map((group) => group.label)).toEqual(["Utleie"]);
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual(["/vert", "/vert/meldinger", "/vert/bookinger", "/vert/drift"]);
    expect(barItemsFor("host", 4).map((item) => item.short)).toEqual(["Boliger", "Meldinger", "Bookinger", "Drift"]);
  });

  it("keeps the host's group off the admin's hotel rail, except on the host's own screens", () => {
    expect(groupsFor("admin").map((group) => group.label)).toEqual(["Hotellet", "Drift", "Roboten", "Resepsjon"]);
    expect(groupsFor("admin", { pathname: "/vert/drift" }).map((group) => group.label)).toEqual(["Hotellet", "Drift", "Roboten", "Resepsjon", "Utleie"]);
    expect(groupsFor("admin", { pathname: "/vertskap" }).map((group) => group.id)).not.toContain("utleie");
  });

  it("gives the admin the hotel's full grouped menu, the same grouping as the other roles", () => {
    // Round 5 adds the night clerk's log (Nattevaktens logg) to Drift.
    const groups = groupsFor("admin", { services: [] });
    expect(groups.map((group) => group.label)).toEqual(["Hotellet", "Drift", "Roboten", "Resepsjon"]);
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual([
      "/",
      "/rom",
      "/gjester",
      "/ruter",
      "/overlevering",
      "/natt",
      "/foresporsler",
      "/vedlikehold",
      "/lager",
      "/ansatte",
      "/hotell",
      "/natteskift",
      "/oyne",
      "/resepsjon",
    ]);
    // Nothing is dropped: every hotel screen is in the menu, once (Stemme once the server has the voice agent).
    const hotel = MODULES.filter((module) => module.group !== "utleie" && module.id !== "stemme").map((module) => module.route);
    expect(groups.flatMap((group) => group.items.map((item) => item.href)).sort()).toEqual([...hotel].sort());
    // The voice screen joins once the server has the agent.
    expect(groupsFor("admin", { services: ["voice-agent"] }).flatMap((group) => group.items.map((item) => item.href))).toContain("/stemme");
  });

  it("leaves out a screen whose service the server lacks; unknown services show everything", () => {
    const count = (role: Role, services?: readonly "voice-agent"[]) => groupsFor(role, { services }).flatMap((group) => group.items).length;
    // The demo menus (jury round 1): admin 18 → the hotel's 14, robot manager 10 → 9, the desk 8, the host 4;
    // round 5 adds the night clerk's log for the admin and the desk.
    expect({ admin: count("admin", []), robot: count("robot", []), receptionist: count("receptionist", []), host: count("host", []) }).toEqual({
      admin: 14,
      robot: 9,
      receptionist: 9,
      host: 4,
    });
    expect(count("admin", ["voice-agent"])).toBe(15);
    expect(count("robot")).toBe(10);
    expect(barItemsFor("robot", 4, { services: [] }).map((item) => item.href)).toEqual(["/", "/rom", "/foresporsler", "/vedlikehold"]);
  });

  it("fills the phone bar with the role's pinned screens first, then the rest in order", () => {
    // The admin's own bar leads with the 06:00 handover (jury round 3).
    expect(barItemsFor("admin", 4).map((item) => item.href)).toEqual(["/", "/overlevering", "/rom", "/foresporsler"]);
    expect(barItemsFor("admin", 4).map((item) => item.short)).toEqual(["Oversikt", "Overlevering", "Rom", "Forespørsler"]);
    // Topped up from the rest in menu order when there is room for more.
    expect(barItemsFor("admin", 5).map((item) => item.href)).toEqual(["/", "/overlevering", "/rom", "/foresporsler", "/gjester"]);
    expect(barItemsFor("receptionist", 4).map((item) => item.href)).toEqual(["/", "/rom", "/gjester", "/foresporsler"]);
    expect(barItemsFor("robot", 4).map((item) => item.href)).toEqual(["/", "/rom", "/foresporsler", "/vedlikehold"]);
    // Fewer pinned screens than places: topped up in group order.
    expect(barItemsFor("receptionist", 6).map((item) => item.href)).toEqual(["/", "/rom", "/gjester", "/foresporsler", "/ruter", "/overlevering"]);
  });
});

describe("AppNav on a desktop (the rail)", () => {
  it("lists the admin's screens under Hotellet, Drift, Roboten and Resepsjon, in registry order: the hotel only", () => {
    render(as("admin", <AppNav services={[]} />));
    const [brand, ...links] = screen.getAllByRole("link");
    const labels = links.map((link) => link.textContent);
    // The hotel's screens (Stemme is out without the voice agent), each once, in registry order under its group.
    const hotel = MODULES.filter((module) => module.group !== "utleie" && module.id !== "stemme").map((module) => module.name);
    // The first link is the Lobby logo (an image, alt "Lobby"), then the screens.
    expect(brand).toHaveAccessibleName(/^Lobby/);
    expect(labels).toEqual(hotel);
    // The demo rail: 14 hotel screens, not 18 (the host's app is one tap away on the user plate).
    expect(hotel).toHaveLength(14);
    expect(screen.queryByText("Utleie")).not.toBeInTheDocument();
    for (const group of ["Hotellet", "Drift", "Roboten", "Resepsjon"]) expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    // The full grouped menu, not a Piloten / Utenfor piloten cut.
    expect(screen.queryByText("Piloten")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Utenfor piloten/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "3D-kart" })).toHaveAttribute("href", "/hotell");
    expect(screen.getByRole("link", { name: "Lager og lin" })).toHaveAttribute("href", "/lager");
  });

  it("gives the admin the same grouped rail when viewing as Resepsjonist, scoped to the desk's screens", () => {
    const session = { user: { u: "siri", name: "Siri Haugen", role: "admin" as const }, view: "receptionist" as const, effectiveRole: "receptionist" as const, exp: 0 };
    render(
      <SessionProvider session={session}>
        <AppNav />
      </SessionProvider>,
    );
    expect(screen.queryByText("Piloten")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Utenfor piloten/ })).not.toBeInTheDocument();
    for (const group of ["Hotellet", "Drift", "Resepsjon"]) expect(screen.getAllByText(group).length).toBeGreaterThan(0);
  });

  it("marks only the current screen; Oversikt only on the home page", () => {
    render(as("admin", <AppNav />));
    expect(screen.getByRole("link", { name: "Oversikt" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
  });

  it("marks a module's screen and everything below it", () => {
    path.current = "/rom?rom=room-319";
    const { unmount } = render(as("admin", <AppNav />));
    expect(screen.getByRole("link", { name: "Oversikt" })).not.toHaveAttribute("aria-current");
    unmount();

    path.current = "/vedlikehold/wo-m1";
    render(as("admin", <AppNav />));
    expect(screen.getByRole("link", { name: "Vedlikehold" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Oversikt" })).not.toHaveAttribute("aria-current");
  });

  it("shows a role only its screens", () => {
    render(as("receptionist", <AppNav />));
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/", "/rom", "/gjester", "/ruter", "/overlevering", "/natt", "/foresporsler", "/ansatte", "/resepsjon"]);
    expect(screen.queryByText("Roboten")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Vedlikehold" })).not.toBeInTheDocument();
  });

  it("shows the user plate with the name and role, and the view switcher for admins", () => {
    render(as("admin", <AppNav />));
    expect(screen.getByText("Hamad")).toBeInTheDocument();
    const plate = plateOf();
    expect(plate).toHaveTextContent("Admin");
    fireEvent.click(plate);
    expect(screen.getByRole("radiogroup", { name: "Vis som" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Admin", "Resepsjonist", "Robotansvarlig"]);
    expect(screen.getByRole("button", { name: "Logg ut" })).toBeInTheDocument();
  });

  it("gives the host their own rail: home is /vert, one group, and no view switcher in the user menu", () => {
    path.current = "/vert/meldinger";
    render(as("host", <AppNav />));
    expect(screen.getByRole("link", { name: /Lobby/ })).toHaveAttribute("href", "/vert");
    expect(screen.getByText("Korttidsutleie i Oslo")).toBeInTheDocument();
    expect(screen.queryByText("Hotellet")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Oversikt" })).not.toBeInTheDocument();
    // A deeper screen owns its path: on /vert/meldinger only Gjestemeldinger is current, not Mine boliger.
    expect(screen.getByRole("link", { name: "Gjestemeldinger" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Mine boliger" })).not.toHaveAttribute("aria-current");
    const plate = plateOf();
    expect(plate).toHaveTextContent("Ingrid Berge");
    expect(plate).toHaveTextContent("Vert");
    fireEvent.click(plate);
    expect(screen.queryByRole("radiogroup", { name: "Vis som" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logg ut" })).toBeInTheDocument();
  });

  it("keeps the admin's view switcher to the hotel's three views (no Vert), with the host's app under Andre visninger", () => {
    render(as("admin", <AppNav />));
    expect(screen.queryByRole("link", { name: "Mine boliger" })).not.toBeInTheDocument();
    fireEvent.click(plateOf());
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).not.toContain("Vert");
    // Admins may open everything: the host's app is one tap away, off the hotel rail.
    expect(screen.getByText("Andre visninger")).toBeInTheDocument();
    const host = screen.getByRole("link", { name: "Utleie for verter" });
    expect(host).toHaveAttribute("href", "/vert");
    fireEvent.click(host);
    expect(plateOf()).toHaveAttribute("aria-expanded", "false");
  });

  it("gives the receptionist and the robot manager no Andre visninger", () => {
    render(as("receptionist", <AppNav />));
    fireEvent.click(plateOf());
    expect(screen.queryByText("Andre visninger")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Utleie for verter" })).not.toBeInTheDocument();
  });

  it("shows an admin the host's group while on one of its screens, so they can move between them", () => {
    path.current = "/vert/meldinger";
    render(as("admin", <AppNav />));
    expect(screen.getByText("Utleie")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gjestemeldinger" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Oversikt" })).toHaveAttribute("href", "/");
  });

  it("leaves Stemme out of the menu while the server has no voice agent, and shows it once it has", () => {
    const { unmount } = render(as("robot", <AppNav services={[]} />));
    expect(screen.queryByRole("link", { name: "Snakk gjennom roboten" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Robotens øyne" })).toBeInTheDocument();
    unmount();
    render(as("robot", <AppNav services={["voice-agent"]} />));
    expect(screen.getByRole("link", { name: "Snakk gjennom roboten" })).toHaveAttribute("href", "/stemme");
  });

  it("closes the user menu on Escape (focus back on the plate) and on a click outside", () => {
    render(as("admin", <AppNav />));
    const plate = plateOf();
    fireEvent.click(plate);
    fireEvent.keyDown(screen.getByRole("button", { name: "Logg ut" }), { key: "Escape" });
    expect(plate).toHaveAttribute("aria-expanded", "false");
    expect(plate).toHaveFocus();

    fireEvent.click(plate);
    fireEvent.pointerDown(document.body);
    expect(plate).toHaveAttribute("aria-expanded", "false");
  });

  it("makes the view switcher one Tab stop, with the arrow keys moving between the views", () => {
    render(as("admin", <AppNav />));
    fireEvent.click(plateOf());
    const [admin, desk, robot] = screen.getAllByRole("radio");
    expect([admin, desk, robot].map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
    admin.focus();
    fireEvent.keyDown(admin, { key: "ArrowDown" });
    expect(desk).toHaveFocus();
    fireEvent.keyDown(desk, { key: "ArrowUp" });
    fireEvent.keyDown(admin, { key: "ArrowUp" });
    expect(robot).toHaveFocus();
  });

  it("holds the bell at the top of the rail, beside the name, on every page", () => {
    path.current = "/foresporsler";
    render(as("receptionist", <AppNav bell={<button type="button">Varsler, 2 nye</button>} />));
    const rail = within(screen.getByRole("navigation", { name: "Hovedmeny" }));
    expect(rail.getByRole("button", { name: "Varsler, 2 nye" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Varsler/ })).toHaveLength(1);
  });

  it("shows the host no hotel bell, and an admin none on the host's screens (they carry their own)", () => {
    path.current = "/vert";
    const bell = <button type="button">Varsler, 2 nye</button>;
    const host = render(as("host", <AppNav bell={bell} />));
    expect(screen.queryByRole("button", { name: /^Varsler/ })).not.toBeInTheDocument();
    host.unmount();
    path.current = "/vert/meldinger";
    const onVert = render(as("admin", <AppNav bell={bell} />));
    expect(screen.queryByRole("button", { name: /^Varsler/ })).not.toBeInTheDocument();
    onVert.unmount();
    path.current = "/rom";
    render(as("admin", <AppNav bell={bell} />));
    expect(screen.getByRole("button", { name: "Varsler, 2 nye" })).toBeInTheDocument();
  });

  it("hides itself on the login pages and when nobody is logged in", () => {
    path.current = "/login";
    expect(render(as("admin", <AppNav />)).container).toBeEmptyDOMElement();
    path.current = "/login/ingen-tilgang";
    expect(render(as("robot", <AppNav />)).container).toBeEmptyDOMElement();
    path.current = "/";
    expect(render(<AppNav />).container).toBeEmptyDOMElement();
  });
});

describe("AppNav on a phone (the bar and Meny)", () => {
  it("shows the role's first four screens with their short names, and Meny for the rest", () => {
    onAPhone();
    path.current = "/vedlikehold";
    render(as("robot", <AppNav />));

    const bar = within(screen.getByRole("navigation", { name: "Hovedmeny" }));
    expect(bar.getAllByRole("link").map((link) => link.textContent)).toEqual(["Oversikt", "Rom", "Forespørsler", "Vedlikehold"]);
    expect(bar.getByRole("link", { name: "Vedlikehold" })).toHaveAttribute("aria-current", "page");
    expect(bar.getByRole("button", { name: "Meny" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("puts the name and the bell in a slim bar along the top, above the page", () => {
    onAPhone();
    path.current = "/rom";
    render(as("robot", <AppNav bell={<button type="button">Varsler, 4 nye</button>} />));
    const top = within(screen.getByRole("banner"));
    expect(top.getByRole("link", { name: /^Lobby/ })).toHaveAttribute("href", "/");
    expect(top.getByRole("button", { name: "Varsler, 4 nye" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Varsler/ })).toHaveLength(1);
  });

  it("gives the host a top bar with their place, linking home to /vert, and no hotel bell", () => {
    onAPhone();
    path.current = "/vert/bookinger";
    render(as("host", <AppNav bell={<button type="button">Varsler, 4 nye</button>} />));
    const top = within(screen.getByRole("banner"));
    expect(top.getByRole("link", { name: /^Lobby/ })).toHaveAttribute("href", "/vert");
    expect(top.getByText("Korttidsutleie i Oslo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Varsler/ })).not.toBeInTheDocument();
    const bar = within(screen.getByRole("navigation", { name: "Hovedmeny" }));
    expect(bar.getAllByRole("link").map((link) => link.textContent)).toEqual(["Boliger", "Meldinger", "Bookinger", "Drift"]);
    expect(bar.getByRole("link", { name: "Bookinger" })).toHaveAttribute("aria-current", "page");
  });

  it("opens every group in a sheet from Meny, with a line on each screen and the user plate", () => {
    onAPhone();
    path.current = "/lager";
    render(as("robot", <AppNav />));

    const bar = within(screen.getByRole("navigation", { name: "Hovedmeny" }));
    // Lager is not on the bar, so nothing there is current.
    expect(bar.queryAllByRole("link").some((link) => link.getAttribute("aria-current") === "page")).toBe(false);
    fireEvent.click(bar.getByRole("button", { name: "Meny" }));

    // Night steel all the way to the title, with its own close button.
    expect(screen.getByRole("dialog", { name: "Meny" })).toHaveAttribute("data-surface", "dark");
    const sheet = within(screen.getByRole("dialog", { name: "Meny" }));
    expect(sheet.getByRole("button", { name: "Lukk" })).toHaveFocus();
    for (const group of ["Hotellet", "Drift", "Roboten"]) expect(sheet.getByText(group)).toBeInTheDocument();
    expect(sheet.queryByText("Resepsjon")).not.toBeInTheDocument();
    const lager = sheet.getByRole("link", { name: /^Lager og lin/ });
    expect(lager).toHaveAttribute("href", "/lager");
    expect(lager).toHaveAttribute("aria-current", "page");
    expect(lager).toHaveTextContent("Lin og utstyr per lagerrom");
    expect(sheet.getByRole("link", { name: /^3D-kart/ })).toHaveTextContent("Gå rundt i hotellet og følg roboten");
    expect(sheet.getAllByRole("link")).toHaveLength(groupsFor("robot").flatMap((group) => group.items).length);
    expect(sheet.getByText("Test")).toBeInTheDocument();
    expect(sheet.getByText("Robotansvarlig")).toBeInTheDocument();
    expect(bar.getByRole("button", { name: "Meny" })).toHaveAttribute("aria-expanded", "true");
  });

  it("gives the admin's Meny the full grouped menu, every screen with its line, no pilot cut", () => {
    onAPhone();
    path.current = "/overlevering";
    render(as("admin", <AppNav services={[]} />));
    const bar = within(screen.getByRole("navigation", { name: "Hovedmeny" }));
    expect(bar.getAllByRole("link").map((link) => link.textContent)).toEqual(["Oversikt", "Overlevering", "Rom", "Forespørsler"]);
    fireEvent.click(bar.getByRole("button", { name: "Meny" }));
    const sheet = within(screen.getByRole("dialog", { name: "Meny" }));
    // The hotel's groups, not a Piloten / Utenfor piloten cut ("Resepsjon" is also a screen name, so allow both).
    for (const group of ["Hotellet", "Drift", "Roboten", "Resepsjon"]) expect(sheet.getAllByText(group).length).toBeGreaterThan(0);
    expect(sheet.queryByText("Piloten")).not.toBeInTheDocument();
    expect(sheet.queryByRole("button", { name: /^Utenfor piloten/ })).not.toBeInTheDocument();
    // Every hotel screen is listed at once (Stemme is out without the voice agent), each with its line.
    expect(sheet.getByRole("link", { name: /^Lager og lin/ })).toHaveTextContent("Lin og utstyr per lagerrom");
    expect(sheet.getByRole("link", { name: /^Overlevering 06:00/ })).toHaveAttribute("aria-current", "page");
    expect(sheet.getAllByRole("link")).toHaveLength(14);
  });
});
