import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppNav } from "./AppNav";

const path = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

describe("AppNav, hotel oversight", () => {
  it("starts with Oversikt for / and Hotell for /hotell, and marks only Oversikt on the home page", () => {
    path.current = "/";
    render(<AppNav />);
    const overview = screen.getByRole("link", { name: "Oversikt" });
    expect(overview).toHaveAttribute("href", "/");
    expect(overview).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Hotell" })).toHaveAttribute("href", "/hotell");
    const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
  });

  it("does not mark Oversikt on other screens", () => {
    path.current = "/hotell";
    render(<AppNav />);
    expect(screen.getByRole("link", { name: "Oversikt" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Hotell" })).toHaveAttribute("aria-current", "page");
  });
});
