import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./navigate", () => ({ hardNavigate: vi.fn() }));

import { LoginForm } from "./LoginForm";
import { hardNavigate } from "./navigate";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(hardNavigate).mockReset();
});

function fill(username: string, password: string) {
  fireEvent.change(screen.getByLabelText("Brukernavn"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Passord"), { target: { value: password } });
}

describe("LoginForm", () => {
  it("has labelled fields that password managers understand, and one primary action", () => {
    render(<LoginForm next="/" unavailable={false} />);
    expect(screen.getByLabelText("Brukernavn")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Passord")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText("Passord")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Logg inn" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows and hides the password", () => {
    render(<LoginForm next="/" unavailable={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Vis passord" }));
    expect(screen.getByLabelText("Passord")).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Skjul passord" }));
    expect(screen.getByLabelText("Passord")).toHaveAttribute("type", "password");
  });

  it("asks for both fields before it sends anything", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm next="/" unavailable={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Logg inn" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Skriv inn brukernavn og passord.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the login, shows the loading state, then goes to next", async () => {
    let resolve: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm next="/hotell" unavailable={false} />);
    fill("Hamad", "test-password");
    fireEvent.click(screen.getByRole("button", { name: "Logg inn" }));
    expect(screen.getByRole("button", { name: "Logg inn" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Logg inn" })).toHaveAttribute("aria-busy", "true");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ username: "Hamad", password: "test-password", next: "/hotell" }) }),
    );
    resolve(Response.json({ session: {}, next: "/hotell" }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/hotell"));
  });

  it("shows the server's error and keeps what was typed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Feil brukernavn eller passord." }, { status: 401 })));
    render(<LoginForm next="/" unavailable={false} />);
    fill("hamad", "nope");
    fireEvent.click(screen.getByRole("button", { name: "Logg inn" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Feil brukernavn eller passord.");
    expect(screen.getByLabelText("Brukernavn")).toHaveValue("hamad");
    expect(screen.getByLabelText("Passord")).toHaveValue("nope");
    expect(screen.getByRole("button", { name: "Logg inn" })).toBeEnabled();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("says what to do when the server can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    render(<LoginForm next="/" unavailable={false} />);
    fill("hamad", "x");
    fireEvent.click(screen.getByRole("button", { name: "Logg inn" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Fikk ikke svar fra serveren. Sjekk nettet og prøv igjen.");
  });

  it("explains when login is switched off on the server, and can't submit", () => {
    render(<LoginForm next="/" unavailable />);
    expect(screen.getByRole("alert")).toHaveTextContent("Innlogging er ikke satt opp på serveren");
    expect(screen.getByRole("button", { name: "Logg inn" })).toBeDisabled();
  });
});
