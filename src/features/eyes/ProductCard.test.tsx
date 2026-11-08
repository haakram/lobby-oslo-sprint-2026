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

const shampoo = productBySku("FT-1001")!;

const match: IdentifyResult = {
  sku: "FT-1001",
  name: "Sjampo 250 ml",
  category: "hygiene",
  textSeen: ["Mild sjampo", "250 ml"],
  kind: "supply",
  summary: "",
  seen: [],
  confidence: "high",
  product: shampoo,
};

const noMatch: IdentifyResult = {
  sku: null,
  name: "Hvit sprayflaske",
  category: "unknown",
  textSeen: ["Glassrens", "500 ml"],
  kind: "supply",
  summary: "",
  seen: [],
  confidence: "low",
  product: null,
};

describe("ProductCard", () => {
  beforeEach(() => {
    add.mockClear();
    push.mockClear();
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

  it("never calls a pillow or a cap missing from the catalogue: it says what kind of thing it is", () => {
    render(<ProductCard result={{ ...noMatch, name: "Pute", kind: "room" }} />);
    expect(screen.getByText("Hotellutstyr")).toBeInTheDocument();
    expect(screen.queryByText("Ikke i katalogen")).not.toBeInTheDocument();
    expect(screen.queryByText(/finnes ikke i katalogen/)).not.toBeInTheDocument();
  });

  it("shows the sentence about the whole picture and the other things seen", () => {
    render(
      <ProductCard
        result={{
          ...noMatch,
          name: "Person",
          kind: "person",
          summary: "En person med caps holder en fjernkontroll.",
          seen: [
            { name: "Caps", kind: "guest" },
            { name: "Fjernkontroll", kind: "room" },
          ],
        }}
      />,
    );
    expect(screen.getByText("En person med caps holder en fjernkontroll.")).toBeInTheDocument();
    expect(screen.getByText("Ser også")).toBeInTheDocument();
    expect(screen.getByText("Caps").parentElement).toHaveTextContent("Caps · gjestens eiendel");
    expect(screen.getByText("Fjernkontroll").parentElement).toHaveTextContent("Fjernkontroll · hotellutstyr");
  });

  it("adds the SKU to the pick list", () => {
    render(<ProductCard result={match} />);
    fireEvent.click(screen.getByRole("button", { name: "Legg i plukkliste" }));
    expect(add).toHaveBeenCalledWith("FT-1001");
  });

  it("opens the route to the product", () => {
    render(<ProductCard result={match} />);
    fireEvent.click(screen.getByRole("button", { name: "Vis vei" }));
    expect(push).toHaveBeenCalledWith("/ruter?sku=FT-1001");
  });
});
