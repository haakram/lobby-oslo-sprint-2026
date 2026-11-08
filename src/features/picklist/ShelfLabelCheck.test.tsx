import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { productBySku } from "@/features/catalog/products";
import { productFromLabel, ShelfLabelCheck } from "./ShelfLabelCheck";

const shampoo = productBySku("FT-1001")!;
const onConfirm = vi.fn();

function type(value: string) {
  fireEvent.change(screen.getByLabelText("Bekreft med etiketten"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Bekreft og legg i plukkliste" }));
}

describe("productFromLabel", () => {
  it("reads a SKU however it is typed off a label", () => {
    expect(productFromLabel("1001")?.sku).toBe("FT-1001");
    expect(productFromLabel("ft-1004")?.sku).toBe("FT-1004");
    expect(productFromLabel(" FT 1012 ")?.sku).toBe("FT-1012");
    expect(productFromLabel("9999")).toBeUndefined();
    expect(productFromLabel("sjampo")).toBeUndefined();
  });
});

describe("ShelfLabelCheck", () => {
  beforeEach(() => onConfirm.mockClear());

  it("puts the camera's guess on the list only when the label agrees", () => {
    render(<ShelfLabelCheck guess={shampoo} onConfirm={onConfirm} />);
    type("1001");
    expect(onConfirm).toHaveBeenCalledWith("FT-1001");
  });

  it("lets the label win when it names another product, and says it was added", () => {
    render(<ShelfLabelCheck guess={shampoo} onConfirm={onConfirm} />);
    type("FT-1004");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/Etiketten viser Såpestykke 100 g/)).toHaveTextContent("ikke Sjampo 250 ml. Etiketten gjelder.");
    fireEvent.click(screen.getByRole("button", { name: "Legg Såpestykke 100 g i plukklisten" }));
    expect(onConfirm).toHaveBeenCalledWith("FT-1004");
    expect(screen.getByText(/Lagt i plukklisten: Såpestykke 100 g/)).toBeInTheDocument();
  });

  it("says what is wrong and keeps the input when the label is empty or unknown", () => {
    render(<ShelfLabelCheck guess={shampoo} onConfirm={onConfirm} />);
    type("");
    expect(screen.getByText("Skriv SKU-en fra etiketten først.")).toBeInTheDocument();
    type("FT-9999");
    expect(screen.getByText("Fant ikke «FT-9999» i katalogen. Sjekk etiketten og skriv den på nytt.")).toBeInTheDocument();
    expect(screen.getByLabelText("Bekreft med etiketten")).toHaveValue("FT-9999");
    expect(screen.getByLabelText("Bekreft med etiketten")).toHaveAttribute("aria-invalid", "true");
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
