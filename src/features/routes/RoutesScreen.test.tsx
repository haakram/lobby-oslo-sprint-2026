import { fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { PicklistProvider, usePicklist } from "@/features/picklist/PicklistProvider";
import { loadRoutes } from "./loadRoutes";
import { RoutesScreen } from "./RoutesScreen";

function Seed({ skus, children }: { skus: string[]; children: ReactNode }) {
  const { add } = usePicklist();
  useEffect(() => {
    skus.forEach(add);
  }, [skus, add]);
  return <>{children}</>;
}

function renderWith(skus: string[], screenElement: ReactNode = <RoutesScreen />) {
  return render(
    <PicklistProvider>
      <Seed skus={skus}>{screenElement}</Seed>
    </PicklistProvider>,
  );
}

// Knekkebrød (hylle 2A), Sjampo (hylle 1A), Vann (hylle 2B), in that list order.
// List order on the stub map: 52 + 54 + 50 + 48 = 204 m. Best: 144 m. Saved 60 m, 29 %.
const THREE = ["FT-1007", "FT-1001", "FT-1010"];

describe("RoutesScreen", () => {
  it("shows the empty state when the pick list is empty", () => {
    renderWith([]);
    expect(screen.getByRole("heading", { name: "Plukklisten er tom" })).toBeInTheDocument();
    expect(screen.getByText(/Legg til varer fra Øyne/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Åpne Øyne" })).toHaveAttribute("href", "/oyne");
  });

  it("shows total metres, saved metres and saved percent for three SKUs", () => {
    renderWith(THREE);
    const stats = screen.getByRole("region", { name: "Rutetall" });
    expect(within(stats).getByText("144")).toBeInTheDocument();
    expect(within(stats).getByText("60")).toBeInTheDocument();
    expect(within(stats).getByText("29")).toBeInTheDocument();
    expect(within(stats).getAllByText("m")).toHaveLength(2);
    expect(within(stats).getByText("%")).toBeInTheDocument();
    expect(within(stats).getByText(/204 m/)).toBeInTheDocument();
  });

  it("lists one numbered stop per shelf, in walking order", () => {
    renderWith(THREE);
    const list = screen.getByRole("list", { name: "Plukkrekkefølge" });
    const stops = within(list).getAllByRole("listitem");
    expect(stops).toHaveLength(3);
    expect(within(list).getByText("Sjampo 250 ml")).toBeInTheDocument();
  });

  it("removes a product from the pick list", () => {
    renderWith(THREE);
    fireEvent.click(screen.getByRole("button", { name: "Fjern Sjampo 250 ml" }));
    expect(screen.queryByText("Sjampo 250 ml")).not.toBeInTheDocument();
    // Hylle 2A and 2B only: 52 + 20 + 48 = 120 m against 52 + 20 + 48 in list order too.
    expect(within(screen.getByRole("region", { name: "Rutetall" })).getByText("120")).toBeInTheDocument();
  });

  it("adds the SKU from ?sku= on load", () => {
    renderWith([], <RoutesScreen addSku="FT-1007" />);
    expect(screen.getByText("Knekkebrød 520 g")).toBeInTheDocument();
  });

  it("ignores a ?sku= that is not in the catalogue", () => {
    renderWith([], <RoutesScreen addSku="FT-9999" />);
    expect(screen.getByRole("heading", { name: "Plukklisten er tom" })).toBeInTheDocument();
  });

  it("switches floors with the floor tabs", () => {
    renderWith(THREE);
    const second = screen.getByRole("tab", { name: /2\. etasje/ });
    expect(second).toHaveAttribute("aria-selected", "false");
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: /2\. etasje/ })).toBeInTheDocument();
  });

  it("says so when the map has no route, without throwing", () => {
    const loaded = loadRoutes();
    if (!loaded.ok) throw new Error(loaded.error);
    const noLegs = { ...loaded.matrix, legs: {} };
    renderWith(THREE, <RoutesScreen matrix={noLegs} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Ingen rute funnet");
  });
});
