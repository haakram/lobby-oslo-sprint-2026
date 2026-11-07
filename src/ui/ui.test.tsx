import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Button, drawLine, EmptyState, fadeRise, Sheet, sheetIn } from "./index";

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
});

describe("EmptyState", () => {
  it("renders its title, body and action", () => {
    render(
      <EmptyState
        title="Plukklisten er tom"
        body="Legg til varer fra Øyne."
        action={<Button>Åpne Øyne</Button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Plukklisten er tom" })).toBeInTheDocument();
    expect(screen.getByText("Legg til varer fra Øyne.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Åpne Øyne" })).toBeInTheDocument();
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
