import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppNav } from "./AppNav";
import { groupsFor } from "./nav";

const path = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

// Outside a SessionProvider the stub session is an admin, who sees every screen.
describe("AppNav, grouped by job", () => {
  it("lists the admin's screens in their groups and marks only Oversikt on the home page", () => {
    path.current = "/";
    render(<AppNav />);
    const labels = screen.getAllByRole("link").map((a) => a.textContent);
    expect(labels).toEqual([
      expect.stringContaining("Lobby"),
      "Oversikt",
      "3D-kart",
      "Ruter",
      "Natteskift",
      "Øyne",
      "Stemme",
      "Resepsjon",
    ]);
    for (const group of ["Hotellet", "Roboten", "Resepsjon"]) expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    const overview = screen.getByRole("link", { name: "Oversikt" });
    expect(overview).toHaveAttribute("href", "/");
    expect(overview).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "3D-kart" })).toHaveAttribute("href", "/hotell");
    const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
  });

  it("does not mark Oversikt on other screens", () => {
    path.current = "/hotell";
    render(<AppNav />);
    expect(screen.getByRole("link", { name: "Oversikt" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "3D-kart" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the user plate with the name and role, and the view switcher for admins", () => {
    path.current = "/";
    render(<AppNav />);
    expect(screen.getByText("Hamad")).toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: false })).toHaveTextContent("Admin");
  });

  it("hides itself on the login page", () => {
    path.current = "/login";
    const { container } = render(<AppNav />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("groupsFor", () => {
  it("gives the receptionist only Oversikt, Ruter and Resepsjon", () => {
    const groups = groupsFor("receptionist");
    expect(groups.map((g) => g.label)).toEqual(["Hotellet", "Resepsjon"]);
    expect(groups.flatMap((g) => g.items.map((i) => i.href))).toEqual(["/", "/ruter", "/resepsjon"]);
  });

  it("gives the robot manager the hotel and the robot, not the reception", () => {
    const hrefs = groupsFor("robot").flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toEqual(["/", "/hotell", "/ruter", "/natteskift", "/oyne", "/stemme"]);
  });
});
