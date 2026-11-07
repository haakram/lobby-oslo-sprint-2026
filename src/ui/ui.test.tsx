import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { MODULES } from "@/features/modules/registry";
import { AppNav, Badge, Button, Card, drawLine, EmptyState, ErrorState, fadeRise, Sheet, sheetIn, Stat } from "./index";

vi.mock("next/navigation", () => ({ usePathname: () => "/resepsjon" }));

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Identifiser</Button>);
    expect(screen.getByRole("button", { name: "Identifiser" })).toBeEnabled();
  });

  it("is disabled and busy while loading", () => {
    render(<Button loading>Identifiser</Button>);
    const button = screen.getByRole("button", { name: "Identifiser" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("is a plain button by default, never a submit by accident", () => {
    render(<Button>Lag renholdsrute</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});

describe("Card, Stat and Badge", () => {
  it("draws a panel on the surface, or sunken on a surface", () => {
    const { rerender } = render(<Card data-testid="card">Innhold</Card>);
    expect(screen.getByTestId("card").className).toContain("bg-surface");
    rerender(
      <Card tone="sunken" data-testid="card">
        Innhold
      </Card>,
    );
    expect(screen.getByTestId("card").className).toContain("bg-sunken");
  });

  it("sets a figure in the mono face with its unit and label, toned by whether it is good or bad", () => {
    render(<Stat label="Klare til salg" value={9} unit="av 36" tone="warning" />);
    const value = screen.getByText("9");
    expect(value.parentElement?.className).toContain("font-mono");
    expect(value.parentElement?.className).toContain("text-warning");
    expect(screen.getByText("av 36")).toBeInTheDocument();
    expect(screen.getByText("Klare til salg")).toBeInTheDocument();
  });

  it("always says the state in words, not only in colour", () => {
    render(<Badge tone="danger">Feilet</Badge>);
    const badge = screen.getByText("Feilet");
    expect(badge.className).toContain("text-danger");
  });
});

describe("EmptyState and ErrorState", () => {
  it("renders what is missing, how to fill it and the action", () => {
    render(<EmptyState title="Plukklisten er tom" body="Legg til varer fra Øyne." action={<Button>Åpne Øyne</Button>} />);
    expect(screen.getByRole("heading", { name: "Plukklisten er tom" })).toBeInTheDocument();
    expect(screen.getByText("Legg til varer fra Øyne.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Åpne Øyne" })).toBeInTheDocument();
  });

  it("announces an error with what happened, what to do next and the action", () => {
    render(<ErrorState title="Fikk ikke lastet natten" body="Sjekk nettet og prøv igjen." action={<Button variant="secondary">Prøv igjen</Button>} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Fikk ikke lastet natten");
    expect(alert).toHaveTextContent("Sjekk nettet og prøv igjen.");
    expect(screen.getByRole("button", { name: "Prøv igjen" })).toBeInTheDocument();
  });
});

describe("motion presets", () => {
  it("animate when motion is allowed", () => {
    expect(fadeRise(false).hidden).toMatchObject({ opacity: 0 });
    expect(sheetIn(false).hidden).toMatchObject({ y: "100%" });
    expect(drawLine(false).hidden).toMatchObject({ pathLength: 0 });
  });

  it("are no-ops under reduced motion", () => {
    for (const preset of [fadeRise, sheetIn, drawLine]) {
      const variants = preset(true);
      expect(variants.hidden).toEqual({});
      expect(variants.visible).toEqual({});
    }
  });
});

function SheetHarness() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <>
      <button onClick={() => setOpen(true)}>Åpne</button>
      {/* A new inline onClose on every render, as real callers write it. */}
      <Sheet open={open} onClose={() => setOpen(false)} title="Bekreft oppgave">
        <input aria-label="Notat" value={note} onChange={(event) => setNote(event.target.value)} />
        <button onClick={() => setOpen(false)}>Lukk</button>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("keeps focus while the parent re-renders, locks scroll, and restores focus on close", () => {
    render(<SheetHarness />);
    const opener = screen.getByRole("button", { name: "Åpne" });
    opener.focus();
    fireEvent.click(opener);

    expect(screen.getByRole("dialog", { name: "Bekreft oppgave" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    const input = screen.getByRole("textbox", { name: "Notat" });
    input.focus();
    fireEvent.change(input, { target: { value: "Rom 214" } });
    expect(input).toHaveValue("Rom 214");
    expect(input).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Lukk" }));
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes on Escape", () => {
    render(<SheetHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Åpne" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
  });
});

describe("AppNav", () => {
  it("has a Resepsjon link in its own group, marked active on /resepsjon, after every other module", () => {
    const admin = { user: { u: "hamad", name: "Hamad", role: "admin" as const }, view: "admin" as const, effectiveRole: "admin" as const, exp: 0 };
    render(
      <SessionProvider session={admin}>
        <AppNav />
      </SessionProvider>,
    );
    const link = screen.getByRole("link", { name: "Resepsjon" });
    expect(link).toHaveAttribute("href", "/resepsjon");
    expect(link).toHaveAttribute("aria-current", "page");
    const labels = screen.getAllByRole("link").map((a) => a.textContent);
    expect(labels.slice(1)).toEqual(MODULES.map((module) => module.name));
    expect(labels.at(-1)).toBe("Resepsjon");
  });
});
