import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "./types";

vi.mock("./navigate", () => ({ hardNavigate: vi.fn() }));

import { hardNavigate } from "./navigate";
import { SessionProvider } from "./SessionProvider";
import { ViewAsBanner } from "./ViewAsBanner";

const admin = (view: Session["view"]): Session => ({
  user: { u: "hamad", name: "Hamad", role: "admin" },
  view,
  effectiveRole: view,
  exp: 2_000_000_000,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(hardNavigate).mockReset();
});

describe("ViewAsBanner", () => {
  it("is absent when nobody views as another role", () => {
    const { container } = render(
      <SessionProvider session={admin("admin")}>
        <ViewAsBanner />
      </SessionProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says which role an admin is viewing as and switches back to admin", async () => {
    const fetchMock = vi.fn(async () => Response.json({ session: admin("admin") }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SessionProvider session={admin("receptionist")}>
        <ViewAsBanner />
      </SessionProvider>,
    );
    expect(screen.getByText("Viser som Resepsjonist")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tilbake til admin" }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/view", expect.objectContaining({ body: JSON.stringify({ view: "admin" }) }));
  });
});
