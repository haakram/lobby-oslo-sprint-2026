import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { productBySku } from "@/features/catalog/products";
import { ProductCard } from "./ProductCard";
import type { IdentifyResult } from "./schema";

const add = vi.fn();
const push = vi.fn();

vi.mock("@/features/picklist/PicklistProvider", () => ({
  usePicklist: () => ({ skus: [], add, remove: vi.fn(), clear: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("@/features/auth", () => ({
  useSession: () => ({ status: "authenticated", user: { u: "siri", name: "Siri Haugen", role: "admin" } }),
}));

const shampoo = productBySku("FT-1001")!;

const match: IdentifyResult = {
  sku: "FT-1001",
  name: "Sjampo 250 ml",
  category: "hygiene",
  textSeen: ["Mild sjampo", "250 ml"],
  confidence: "high",
  product: shampoo,
};

const noMatch: IdentifyResult = {
  sku: null,
  name: "Hvit sprayflaske",
  category: "unknown",
  textSeen: ["Glassrens", "500 ml"],
  confidence: "low",
  product: null,
};

/** What Øyne stored as avvik on this device, every day's lines together. */
function storedAvvik(): { kind: string; data: Record<string, unknown> }[] {
  const raw = localStorage.getItem("lobby:oyne-avvik");
  return raw ? Object.values(JSON.parse(raw) as Record<string, { kind: string; data: Record<string, unknown> }[]>).flat() : [];
}

describe("ProductCard", () => {
  beforeEach(() => {
    add.mockClear();
    push.mockClear();
    localStorage.clear();
  });

  it("shows the product's name, SKU, location and both actions", () => {
    render(<ProductCard result={match} />);
    expect(screen.getByText("Sjampo 250 ml")).toBeInTheDocument();
    expect(screen.getByText("FT-1001")).toBeInTheDocument();
    expect(screen.getByText(shampoo.locationLabel)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vis vei" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Legg i plukkliste" })).toBeInTheDocument();
  });

  it("says when the product is not in the catalogue, shows what it read, and offers no route", () => {
    render(<ProductCard result={noMatch} />);
    expect(screen.getByText("Ikke i katalogen")).toBeInTheDocument();
    expect(screen.getByText("Glassrens")).toBeInTheDocument();
    expect(screen.getByText("500 ml")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vis vei" })).not.toBeInTheDocument();
  });

  it("adds the SKU to the pick list", () => {
    render(<ProductCard result={match} />);
    fireEvent.click(screen.getByRole("button", { name: "Legg i plukkliste" }));
    expect(add).toHaveBeenCalledWith("FT-1001");
  });

  it("shows the camera's guess and its alternatives to choose from when unsure, with no SKU and no way round the person", () => {
    for (const confidence of ["medium", "low"] as const) {
      const { unmount } = render(<ProductCard result={{ ...match, confidence, alternatives: ["FT-1003", "FT-1002"] }} />);
      expect(screen.getByRole("heading", { name: "Er det en av disse?" })).toBeInTheDocument();
      const choices = screen.getAllByRole("button", { name: /^Ja, det er denne/ });
      expect(choices.map((button) => button.getAttribute("aria-label"))).toEqual([
        "Ja, det er denne: Sjampo 250 ml",
        "Ja, det er denne: Dusjsåpe 250 ml",
        "Ja, det er denne: Flytende såpe 300 ml",
      ]);
      // Each candidate carries its look from the catalogue, so the person compares it with the item in hand.
      expect(screen.getByText(shampoo.description)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ingen av disse" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Vis vei" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Legg i plukkliste" })).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/FT-100\d/);
      expect(push).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("takes the person's choice: the chosen product with its SKU, its shelf and both actions", () => {
    render(<ProductCard result={{ ...match, confidence: "low", alternatives: ["FT-1003"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Ja, det er denne: Dusjsåpe 250 ml" }));
    expect(screen.getByText("Valgt av deg")).toBeInTheDocument();
    expect(screen.getByText("FT-1003")).toBeInTheDocument();
    expect(screen.getByText(productBySku("FT-1003")!.locationLabel)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Legg i plukkliste" }));
    expect(add).toHaveBeenCalledWith("FT-1003");
    fireEvent.click(screen.getByRole("button", { name: "Vis vei" }));
    expect(push).toHaveBeenCalledWith("/ruter?sku=FT-1003");
    fireEvent.click(screen.getByRole("button", { name: "Velg en annen" }));
    expect(screen.getByRole("heading", { name: "Er det en av disse?" })).toBeInTheDocument();
  });

  it("turns Ingen av disse into an avvik for Overlevering, with who and what was shown, and Angre takes it back", () => {
    render(<ProductCard result={{ ...match, confidence: "low", alternatives: ["FT-1003"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Ingen av disse" }));
    const [line] = storedAvvik();
    expect(line.kind).toBe("work_order");
    expect(line.data).toMatchObject({ source: "eyes", type: "annet", by: "Siri Haugen", candidates: ["FT-1001", "FT-1003"], seen: ["Mild sjampo", "250 ml"] });
    expect(String(line.data.text)).toContain("ingen av forslagene stemte (Sjampo 250 ml og Dusjsåpe 250 ml)");
    expect(screen.getByRole("status")).toHaveTextContent(/Meldt som avvik kl\. \d\d:\d\d\. Renhold ser det under Åpent nå på Overlevering 06:00\./);
    expect(add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Angre avviket" }));
    expect(storedAvvik()).toEqual([]);
    expect(screen.getByRole("button", { name: "Ingen av disse" })).toBeInTheDocument();
  });

  it("lets an item that is not in the catalogue be reported as an avvik too", () => {
    render(<ProductCard result={noMatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Meld som avvik" }));
    const [line] = storedAvvik();
    expect(line.data).toMatchObject({ source: "eyes", candidates: [], seen: ["Glassrens", "500 ml"] });
    expect(String(line.data.text)).toBe("Ukjent vare: finnes ikke i katalogen (kameraet så hvit sprayflaske).");
  });

  it("keeps the label check for items that carry their own label: the guess goes on the list only when it agrees", () => {
    render(<ProductCard result={{ ...match, confidence: "medium" }} />);
    expect(screen.getByText("Varen har egen etikett med SKU")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Bekreft med etiketten"), { target: { value: "1001" } });
    fireEvent.click(screen.getByRole("button", { name: "Bekreft og legg i plukkliste" }));
    expect(add).toHaveBeenCalledWith("FT-1001");
  });

  it("opens the route to the product", () => {
    render(<ProductCard result={match} />);
    fireEvent.click(screen.getByRole("button", { name: "Vis vei" }));
    expect(push).toHaveBeenCalledWith("/ruter?sku=FT-1001");
  });
});
