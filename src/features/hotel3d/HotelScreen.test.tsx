import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HotelScreen } from "./HotelScreen";

const SAMPLE = readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/sample.jsonl"), "utf8");

beforeEach(() => {
  // The demo night only; the local viewer server is not running.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/runs/demo.jsonl")) return new Response(SAMPLE);
      throw new TypeError("Failed to fetch");
    }),
  );
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderReady() {
  render(<HotelScreen />);
  return screen.findByRole("combobox", { name: "Velg rom" });
}

describe("HotelScreen", () => {
  it("gives the map its own height below lg, where the column has none (h-full alone was 0 px on a phone)", async () => {
    await renderReady();
    const map = screen.getByRole("figure", { name: "Hotellet som plantegning" }).closest("[data-surface=dark].relative")!;
    const classes = map.className.split(" ");
    expect(classes).toContain("h-[56dvh]!");
    expect(classes).toContain("lg:h-full!");
    expect(classes).not.toContain("h-full!");
  });

  it("shows Skjul panel only beside the map, where the drawer can close", async () => {
    await renderReady();
    const toggle = screen.getByRole("button", { name: "Skjul panel" });
    expect(toggle.parentElement).toHaveClass("hidden", "lg:block");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Vis panel" })).toHaveAttribute("aria-pressed", "false");
  });

  it("opens a room's card from the Velg rom list, with each room's status in words, and scrolls it into view", async () => {
    const select = await renderReady();
    const options = within(select).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Ingen rom valgt");
    expect(options.find((option) => option.getAttribute("value") === "room-319")).toHaveTextContent(/^Rom 319 · \S/);

    fireEvent.change(select, { target: { value: "room-319" } });
    const drawer = screen.getByRole("complementary", { name: "Status nå" });
    expect(within(drawer).getByRole("heading", { name: "Rom 319" })).toBeInTheDocument();
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(screen.getByRole("button", { name: /^Rom 319:/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(drawer).getByRole("button", { name: "Lukk Rom 319" }));
    expect(screen.queryByRole("heading", { name: "Rom 319" })).not.toBeInTheDocument();
    expect(select).toHaveValue("");
  });

  it("asks no viewer server when NEXT_PUBLIC_VIEWER_URL is unset: the recording plays and the console stays clean", async () => {
    await renderReady();
    const asked = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(asked).toEqual(["/runs/demo.jsonl"]);
    expect(screen.queryByRole("button", { name: "Direkte" })).not.toBeInTheDocument();
  });

  it("asks the configured viewer server from a local page and switches to it when it answers", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/runs/demo.jsonl")) return new Response(SAMPLE);
      if (url === "http://127.0.0.1:8765/api/runs") return Response.json([]);
      throw new TypeError("Failed to fetch");
    });
    render(<HotelScreen viewerUrl="http://127.0.0.1:8765" />);
    expect(await screen.findByRole("button", { name: "Direkte" })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).toContain("http://127.0.0.1:8765/api/runs");
  });
});
