import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "./types";

vi.mock("./navigate", () => ({ hardNavigate: vi.fn() }));

import { NoAccessActions } from "./NoAccessActions";
import { SessionProvider } from "./SessionProvider";

const session = (role: Session["user"]["role"], view: Session["view"] = role): Session => ({
  user: { u: "x", name: "X", role },
  view,
  effectiveRole: view,
  exp: 2_000_000_000,
});

describe("NoAccessActions", () => {
  it("offers home and 'open as admin' to an admin viewing as another role", () => {
    render(
      <SessionProvider session={session("admin", "robot")}>
        <NoAccessActions />
      </SessionProvider>,
    );
    expect(screen.getByRole("link", { name: "Gå til forsiden" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Åpne som admin" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Logg ut" })).toBeNull();
  });

  it("offers home and log out to everyone else", () => {
    render(
      <SessionProvider session={session("receptionist")}>
        <NoAccessActions />
      </SessionProvider>,
    );
    expect(screen.getByRole("button", { name: "Logg ut" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Åpne som admin" })).toBeNull();
  });
});
