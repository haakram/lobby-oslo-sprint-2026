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
  const session = { user: { u: role, name: role === "admin" ? "Hamad" : "Test", role }, view: role, effectiveRole: role, exp: 0 };
  return <SessionProvider session={session}>{children}</SessionProvider>;
}

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
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual(["/", "/rom", "/gjester", "/ruter", "/foresporsler", "/ansatte", "/resepsjon"]);
  });

  it("gives the robot manager the hotel, maintenance and stores, and the robot, not the reception", () => {
    const groups = groupsFor("robot");
    expect(groups.map((group) => group.label)).toEqual(["Hotellet", "Drift", "Roboten"]);
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual(["/", "/rom", "/ruter", "/foresporsler", "/vedlikehold", "/lager", "/hotell", "/natteskift", "/oyne", "/stemme"]);
  });

  it("fills the phone bar with the role's pinned screens first, then the rest in order", () => {
    expect(barItemsFor("admin", 4).map((item) => item.href)).toEqual(["/", "/rom", "/gjester", "/foresporsler"]);
    expect(barItemsFor("receptionist", 4).map((item) => item.href)).toEqual(["/", "/rom", "/gjester", "/foresporsler"]);
    expect(barItemsFor("robot", 4).map((item) => item.href)).toEqual(["/", "/rom", "/foresporsler", "/vedlikehold"]);
    // Fewer pinned screens than places: topped up in group order.
    expect(barItemsFor("receptionist", 6).map((item) => item.href)).toEqual(["/", "/rom", "/gjester", "/foresporsler", "/ruter", "/ansatte"]);
  });
});

describe("AppNav on a desktop (the rail)", () => {
  it("lists the admin's screens under Hotellet, Drift, Roboten and Resepsjon, in registry order", () => {
    render(as("admin", <AppNav />));
    const labels = screen.getAllByRole("link").map((link) => link.textContent);
    expect(labels).toEqual([expect.stringContaining("Lobby"), ...MODULES.map((module) => module.name)]);
    for (const group of ["Hotellet", "Drift", "Roboten", "Resepsjon"]) expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "3D-kart" })).toHaveAttribute("href", "/hotell");
    expect(screen.getByRole("link", { name: "Lager og lin" })).toHaveAttribute("href", "/lager");
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
    expect(hrefs).toEqual(["/", "/", "/rom", "/gjester", "/ruter", "/foresporsler", "/ansatte", "/resepsjon"]);
    expect(screen.queryByText("Roboten")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Vedlikehold" })).not.toBeInTheDocument();
  });

  it("shows the user plate with the name and role, and the view switcher for admins", () => {
    render(as("admin", <AppNav />));
    expect(screen.getByText("Hamad")).toBeInTheDocument();
    const plate = screen.getByRole("button", { expanded: false });
    expect(plate).toHaveTextContent("Admin");
    fireEvent.click(plate);
    expect(screen.getByRole("radiogroup", { name: "Vis som" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Admin", "Resepsjonist", "Robotansvarlig"]);
    expect(screen.getByRole("button", { name: "Logg ut" })).toBeInTheDocument();
  });

  it("closes the user menu on Escape (focus back on the plate) and on a click outside", () => {
    render(as("admin", <AppNav />));
    const plate = screen.getByRole("button", { expanded: false });
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
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const [admin, desk, robot] = screen.getAllByRole("radio");
    expect([admin, desk, robot].map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
    admin.focus();
    fireEvent.keyDown(admin, { key: "ArrowDown" });
    expect(desk).toHaveFocus();
    fireEvent.keyDown(desk, { key: "ArrowUp" });
    fireEvent.keyDown(admin, { key: "ArrowUp" });
    expect(robot).toHaveFocus();
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
});
