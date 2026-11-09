import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionProvider } from "@/features/auth/SessionProvider";
import type { Session } from "@/features/auth/types";
import { UserPlate } from "./UserPlate";

const ADMIN: Session = { user: { u: "hamad", name: "Hamad", role: "admin" }, view: "admin", effectiveRole: "admin", exp: 2_000_000_000 };
const DEMO: Session = { user: { u: "demo", name: "Demo", role: "admin" }, view: "admin", effectiveRole: "admin", exp: 2_000_000_000 };

function open(session: Session, openDemo = false) {
  render(
    <SessionProvider session={session} openDemo={openDemo}>
      <UserPlate />
    </SessionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { expanded: false }));
}

describe("UserPlate", () => {
  it("with a login: the admin's view switcher, the host's app and Logg ut", () => {
    open(ADMIN);
    expect(screen.getByRole("radiogroup", { name: "Vis som" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Utleie for verter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logg ut" })).toBeInTheDocument();
    expect(screen.getAllByText("Admin")).toHaveLength(2); // the plate's role line and the switcher's first option
  });

  it("in the open demo: no view switcher and no Logg ut, the host's app still one tap away", () => {
    open(DEMO, true);
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText("Åpen demo · ingen innlogging")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Logg ut" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Utleie for verter" })).toBeInTheDocument();
  });
});
