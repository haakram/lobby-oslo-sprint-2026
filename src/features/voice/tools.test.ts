import { describe, expect, it, vi } from "vitest";
import { createClientTools, type VoiceUi } from "./tools";

function fakeUi() {
  return {
    showProduct: vi.fn(),
    showRoute: vi.fn(),
    showGuide: vi.fn(),
    proposeTask: vi.fn(),
  } satisfies VoiceUi;
}

function noUiCalls(ui: ReturnType<typeof fakeUi>) {
  expect(ui.showProduct).not.toHaveBeenCalled();
  expect(ui.showRoute).not.toHaveBeenCalled();
  expect(ui.showGuide).not.toHaveBeenCalled();
  expect(ui.proposeTask).not.toHaveBeenCalled();
}

describe("createClientTools", () => {
  it("offers exactly the four allowlisted tools", () => {
    expect(Object.keys(createClientTools(fakeUi())).sort()).toEqual([
      "queue_robot_task",
      "show_guide",
      "show_product",
      "show_route",
    ]);
  });

  describe("show_product", () => {
    it("shows a known product once and tells the agent where it is", async () => {
      const ui = fakeUi();
      const reply = await createClientTools(ui).show_product({ sku: "FT-1001" });
      expect(ui.showProduct).toHaveBeenCalledTimes(1);
      expect(ui.showProduct.mock.calls[0]?.[0]).toMatchObject({ sku: "FT-1001", name: "Sjampo 250 ml" });
      expect(reply).toContain("Lager 1, hylle A");
    });

    it("accepts a SKU heard in lower case with spaces around it", async () => {
      const ui = fakeUi();
      await createClientTools(ui).show_product({ sku: "  ft-1002 " });
      expect(ui.showProduct.mock.calls[0]?.[0]).toMatchObject({ sku: "FT-1002" });
    });

    it("refuses an unknown SKU without touching the screen", async () => {
      const ui = fakeUi();
      const reply = await createClientTools(ui).show_product({ sku: "FT-9999" });
      expect(reply).toContain("ukjent");
      noUiCalls(ui);
    });

    it("refuses arguments of the wrong shape", async () => {
      const ui = fakeUi();
      const tools = createClientTools(ui);
      for (const bad of [undefined, null, "FT-1001", { sku: 1001 }, {}]) {
        expect(typeof (await tools.show_product(bad))).toBe("string");
      }
      noUiCalls(ui);
    });
  });

  describe("show_route", () => {
    it("shows a route for known SKUs, in the order given", async () => {
      const ui = fakeUi();
      const reply = await createClientTools(ui).show_route({ skus: ["FT-1007", "FT-1001"] });
      expect(ui.showRoute).toHaveBeenCalledWith(["FT-1007", "FT-1001"]);
      expect(reply).toMatch(/2 stopp/);
    });

    it("drops repeated SKUs", async () => {
      const ui = fakeUi();
      await createClientTools(ui).show_route({ skus: ["FT-1001", "ft-1001", "FT-1002"] });
      expect(ui.showRoute).toHaveBeenCalledWith(["FT-1001", "FT-1002"]);
    });

    it("refuses an empty list", async () => {
      const ui = fakeUi();
      const reply = await createClientTools(ui).show_route({ skus: [] });
      expect(reply).toMatch(/minst én/);
      noUiCalls(ui);
    });

    it("refuses more than 7 SKUs", async () => {
      const ui = fakeUi();
      const skus = ["FT-1001", "FT-1002", "FT-1003", "FT-1004", "FT-1005", "FT-1006", "FT-1007", "FT-1008"];
      const reply = await createClientTools(ui).show_route({ skus });
      expect(reply).toMatch(/7/);
      noUiCalls(ui);
    });

    it("refuses the whole route when one SKU is unknown, and names it", async () => {
      const ui = fakeUi();
      const reply = await createClientTools(ui).show_route({ skus: ["FT-1001", "FT-4242"] });
      expect(reply).toContain("ukjent");
      expect(reply).toContain("FT-4242");
      noUiCalls(ui);
    });
  });

  describe("show_guide", () => {
    it("shows one of the four guides", async () => {
      const ui = fakeUi();
      const reply = await createClientTools(ui).show_guide({ step: "picking" });
      expect(ui.showGuide).toHaveBeenCalledWith("picking");
      expect(reply.length).toBeGreaterThan(0);
    });

    it("refuses a guide that does not exist", async () => {
      const ui = fakeUi();
      const reply = await createClientTools(ui).show_guide({ step: "open_the_safe" });
      expect(reply).toContain("receiving");
      noUiCalls(ui);
    });
  });

  describe("queue_robot_task", () => {
    it("only proposes the task and tells the agent a person must confirm it", async () => {
      const ui = fakeUi();
      const reply = await createClientTools(ui).queue_robot_task({ text: "Hent 4 håndklær til rom 204" });
      expect(ui.proposeTask).toHaveBeenCalledWith("Hent 4 håndklær til rom 204");
      expect(reply).toMatch(/bekreft/i);
      expect(reply).toMatch(/ikke sendt/i);
    });

    it("refuses text over 200 characters", async () => {
      const ui = fakeUi();
      const reply = await createClientTools(ui).queue_robot_task({ text: "x".repeat(201) });
      expect(reply).toMatch(/200/);
      noUiCalls(ui);
    });

    it("refuses blank text", async () => {
      const ui = fakeUi();
      await createClientTools(ui).queue_robot_task({ text: "   " });
      noUiCalls(ui);
    });
  });
});
