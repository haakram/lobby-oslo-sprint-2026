import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, drawLine, EmptyState, fadeRise, sheetIn } from "./index";

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
