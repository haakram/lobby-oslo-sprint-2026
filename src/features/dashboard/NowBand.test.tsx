import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NowItem } from "./now";
import { MAX_ROWS, NowBand } from "./NowBand";

// The band shows six rows with their actions; whatever is left is named in one line, never dropped.
function item(id: string, tone: NowItem["tone"], text: string, module: NowItem["module"] = "foresporsler"): NowItem {
  return { id, module, tone, icon: "inbox", text, action: { label: "Åpne", href: "/foresporsler" } };
}

describe("NowBand", () => {
  it("shows six rows, then names the rest in one 'og N til' line with a link into each module", () => {
    const items = [
      ...Array.from({ length: MAX_ROWS }, (_, i) => item(`r${i}`, "warning", `Rad ${i + 1}`)),
      item("robot", "warning", "Roboten har lavt batteri, 13 %", "hotell3d"),
      item("dirty", "muted", "Ingen rom må vaskes", "rom"),
    ];
    render(<NowBand items={items} loading={false} />);
    const band = within(screen.getByRole("region", { name: "Oversikt" }));

    expect(band.getAllByRole("link", { name: "Åpne" })).toHaveLength(MAX_ROWS);
    expect(band.getByText("og 2 til:")).toBeInTheDocument();
    expect(band.getByRole("link", { name: "Roboten har lavt batteri, 13 %" })).toHaveAttribute("href", "/hotell");
    expect(band.getByRole("link", { name: "Ingen rom må vaskes" })).toHaveAttribute("href", "/rom");
  });

  it("has no overflow line when everything fits", () => {
    render(<NowBand items={[item("a", "warning", "Rad 1")]} loading={false} />);
    expect(screen.queryByText(/^og \d+ til/)).not.toBeInTheDocument();
  });

  it("says a danger row is urgent in words and with its own icon, not only in red", () => {
    render(<NowBand items={[item("req", "danger", "12 forespørsler venter på noen · 1 feilet")]} loading={false} />);
    expect(screen.getByText("Haster:")).toHaveClass("sr-only");
    expect(screen.getByText(/1 feilet$/)).toBeInTheDocument();
  });

  it("keeps a placeholder row while the night is still loading, under what is already known", () => {
    render(<NowBand items={[item("a", "warning", "Rad 1")]} loading />);
    expect(screen.getByText("Rad 1")).toBeInTheDocument();
    expect(screen.getByText("Henter natten")).toBeInTheDocument();
  });
});
